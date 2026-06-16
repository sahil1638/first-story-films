import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { testRunId, cleanupTestData } from "./test-cleanup";

vi.mock("server-only", () => ({}));

let currentMockClient: SupabaseClient | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => currentMockClient),
}));

import { updateLead } from "@/lib/data/leads";
import type { LeadFormInput } from "@/lib/actions/leads";
import {
  updateQuotationDeliverables,
  updateQuotationServicePersons,
} from "@/lib/data/quotations";
import { upsertMaster } from "@/lib/data/masters";
import { allocateCrew } from "@/lib/data/orders";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach((line) => {
        const parts = line.split("=");
        if (parts.length >= 2) {
          process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
        }
      });
    }
  } catch {
    // Ignore missing local env
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isCi = process.env.CI === "true";
let integrationReady = false;
let integrationSkipReason = "";

function requireIntegrationReady() {
  if (integrationReady) return true;
  const msg = `Skipping atomic replacement mutation tests: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

function buildLeadInput(eventId: string, serviceIds: string[], overrides: Partial<LeadFormInput> = {}): LeadFormInput {
  return {
    your_name: "Lead Client",
    couple_name: "Lead Couple",
    referral_source: "Instagram",
    contact_number: "9876543210",
    email: "lead@example.com",
    event_location: "Jaipur",
    wedding_date: "2026-12-10",
    wedding_venue: "Royal Palace",
    album_requirement: "yes_large",
    drone_requirement: "one_drone",
    shooting_side: "both",
    pre_wedding_shoot: "yes_local",
    functions_count: 1,
    has_additional_info: false,
    additional_details: undefined,
    agreement_accepted: true,
    budget_range: "2-3L",
    function_days: [
      {
        day_index: 1,
        day_date: "2026-12-10",
        first_event_id: eventId,
        service_ids: serviceIds,
      },
    ],
    ...overrides,
  };
}

describe("Atomic replacement mutations", () => {
  let adminClient!: SupabaseClient;
  let managerClient!: SupabaseClient;
  let managerUser!: User;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      const rawAdminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      adminClient = new Proxy(rawAdminClient, {
        get(target, prop, receiver) {
          if (prop === "from") {
            return (table: string) => {
              const queryBuilder = target.from(table);
              const originalInsert = queryBuilder.insert.bind(queryBuilder);
              const originalUpsert = queryBuilder.upsert.bind(queryBuilder);

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              queryBuilder.insert = (values: any, options?: any) => {
                if (Array.isArray(values)) {
                  values = values.map((value) => ({
                    ...value,
                    test_run_id: testRunId,
                    created_by_test: true,
                  }));
                } else if (values && typeof values === "object") {
                  values = {
                    ...values,
                    test_run_id: testRunId,
                    created_by_test: true,
                  };
                }
                return originalInsert(values, options);
              };

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              queryBuilder.upsert = (values: any, options?: any) => {
                if (Array.isArray(values)) {
                  values = values.map((value) => ({
                    ...value,
                    test_run_id: testRunId,
                    created_by_test: true,
                  }));
                } else if (values && typeof values === "object") {
                  values = {
                    ...values,
                    test_run_id: testRunId,
                    created_by_test: true,
                  };
                }
                return originalUpsert(values, options);
              };

              return queryBuilder;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      const managerEmail = `atomic-manager-${Date.now()}@example.com`;
      const password = "TestPassword123!";

      const { data: managerAuth, error: managerError } = await adminClient.auth.admin.createUser({
        email: managerEmail,
        password,
        email_confirm: true,
        app_metadata: { role: "manager" },
        user_metadata: { role: "manager" },
      });
      if (managerError) throw managerError;
      managerUser = managerAuth.user;

      const { error: profileError } = await adminClient.from("profiles").upsert({
        id: managerUser.id,
        email: managerEmail,
        role: "manager",
      });
      if (profileError) throw profileError;

      managerClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false },
      });
      const { error: signInError } = await managerClient.auth.signInWithPassword({
        email: managerEmail,
        password,
      });
      if (signInError) throw signInError;

      integrationReady = true;
    } catch (error) {
      if (isCi) throw error;
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("rolls back lead child replacement if a later child insert fails", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: event } = await adminClient.from("events").insert({ name: "Lead Event A", status: "active" }).select().single();
    const { data: service } = await adminClient.from("services").insert({ name: "Lead Service A", status: "active" }).select().single();
    const { data: lead } = await adminClient.from("leads").insert({
      source: "admin_manual",
      status: "pending",
      your_name: "Original Lead",
      couple_name: "Original Couple",
      referral_source: "Instagram",
      contact_number: "9876543210",
      email: "original-lead@example.com",
      event_location: "Udaipur",
      wedding_date: "2026-11-11",
      wedding_venue: "Lake Palace",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      agreement_accepted: true,
      budget_range: "2-3L",
      created_by: managerUser.id,
    }).select().single();
    const { data: leadDay } = await adminClient.from("lead_function_days").insert({
      lead_id: lead.id,
      day_index: 1,
      day_date: "2026-11-11",
      first_event_id: event.id,
    }).select().single();
    await adminClient.from("lead_function_day_services").insert({
      lead_function_day_id: leadDay.id,
      service_id: service.id,
    });

    const brokenInput = buildLeadInput(event.id, [service.id], {
      couple_name: "Broken Replacement",
      functions_count: 2,
      function_days: [
        {
          day_index: 1,
          day_date: "2026-11-11",
          first_event_id: event.id,
          service_ids: [service.id],
        },
        {
          day_index: 1,
          day_date: "2026-11-12",
          first_event_id: event.id,
          service_ids: [service.id],
        },
      ],
    });

    await expect(updateLead(lead.id, brokenInput)).rejects.toThrow();

    const { data: leadAfter } = await adminClient.from("leads").select("couple_name").eq("id", lead.id).single();
    const { data: daysAfter } = await adminClient
      .from("lead_function_days")
      .select("id, day_index, lead_function_day_services(service_id)")
      .eq("lead_id", lead.id)
      .order("day_index", { ascending: true });

    expect(leadAfter?.couple_name).toBe("Original Couple");
    expect(daysAfter).toHaveLength(1);
    expect(daysAfter?.[0]?.day_index).toBe(1);
    expect(daysAfter?.[0]?.lead_function_day_services).toEqual([{ service_id: service.id }]);
  });

  it("does not create replacement lead child rows when the parent update fails", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: event } = await adminClient.from("events").insert({ name: "Lead Event B", status: "active" }).select().single();
    const { data: service } = await adminClient.from("services").insert({ name: "Lead Service B", status: "active" }).select().single();
    const { data: lead } = await adminClient.from("leads").insert({
      source: "admin_manual",
      status: "pending",
      your_name: "Stable Lead",
      couple_name: "Stable Couple",
      referral_source: "Instagram",
      contact_number: "9876543211",
      email: "stable-lead@example.com",
      event_location: "Jodhpur",
      wedding_date: "2026-10-10",
      wedding_venue: "Blue Palace",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      agreement_accepted: true,
      budget_range: "2-3L",
      created_by: managerUser.id,
    }).select().single();
    const { data: leadDay } = await adminClient.from("lead_function_days").insert({
      lead_id: lead.id,
      day_index: 1,
      day_date: "2026-10-10",
      first_event_id: event.id,
    }).select().single();
    await adminClient.from("lead_function_day_services").insert({
      lead_function_day_id: leadDay.id,
      service_id: service.id,
    });

    const invalidStatusInput = buildLeadInput(event.id, [service.id], {
      status: "bogus_status",
      function_days: [
        {
          day_index: 2,
          day_date: "2026-10-11",
          first_event_id: event.id,
          service_ids: [service.id],
        },
      ],
    });

    await expect(updateLead(lead.id, invalidStatusInput)).rejects.toThrow();

    const { data: daysAfter } = await adminClient
      .from("lead_function_days")
      .select("day_index")
      .eq("lead_id", lead.id)
      .order("day_index", { ascending: true });

    expect(daysAfter).toEqual([{ day_index: 1 }]);
  });

  it("successfully replaces lead child rows exactly once", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: event1 } = await adminClient.from("events").insert({ name: "Lead Event C1", status: "active" }).select().single();
    const { data: event2 } = await adminClient.from("events").insert({ name: "Lead Event C2", status: "active" }).select().single();
    const { data: service1 } = await adminClient.from("services").insert({ name: "Lead Service C1", status: "active" }).select().single();
    const { data: service2 } = await adminClient.from("services").insert({ name: "Lead Service C2", status: "active" }).select().single();
    const { data: lead } = await adminClient.from("leads").insert({
      source: "admin_manual",
      status: "pending",
      your_name: "Replace Lead",
      couple_name: "Replace Couple",
      referral_source: "Instagram",
      contact_number: "9876543212",
      email: "replace-lead@example.com",
      event_location: "Ajmer",
      wedding_date: "2026-09-09",
      wedding_venue: "Sunset Fort",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      agreement_accepted: true,
      budget_range: "2-3L",
      created_by: managerUser.id,
    }).select().single();

    await updateLead(lead.id, buildLeadInput(event1.id, [service1.id, service1.id, service2.id], {
      couple_name: "Updated Couple",
      functions_count: 2,
      function_days: [
        {
          day_index: 1,
          day_date: "2026-09-09",
          first_event_id: event1.id,
          service_ids: [service1.id, service1.id, service2.id],
        },
        {
          day_index: 2,
          day_date: "2026-09-10",
          first_event_id: event2.id,
          service_ids: [service2.id],
        },
      ],
    }));

    const { data: daysAfter } = await adminClient
      .from("lead_function_days")
      .select("day_index, lead_function_day_services(service_id)")
      .eq("lead_id", lead.id)
      .order("day_index", { ascending: true });

    expect(daysAfter).toHaveLength(2);
    expect(daysAfter?.[0]?.lead_function_day_services).toEqual(
      expect.arrayContaining([{ service_id: service1.id }, { service_id: service2.id }])
    );
    expect(daysAfter?.[0]?.lead_function_day_services).toHaveLength(2);
    expect(daysAfter?.[1]?.lead_function_day_services).toEqual([{ service_id: service2.id }]);
  });

  it("rolls back quotation selection replacement if a replacement insert fails", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: event } = await adminClient.from("events").insert({ name: "Quote Event A", status: "active" }).select().single();
    const { data: service } = await adminClient.from("services").insert({ name: "Quote Service A", status: "active" }).select().single();
    const { data: deliverable } = await adminClient.from("deliverables").insert({ title: "Quote Deliverable A", status: "active" }).select().single();
    const { data: quotation } = await adminClient.from("quotations").insert({
      status: "pending",
      your_name: "Quote Client",
      couple_name: "Quote Couple",
      referral_source: "Instagram",
      contact_number: "9876543220",
      email: "quote@example.com",
      event_location: "Pushkar",
      wedding_date: "2026-08-08",
      wedding_venue: "Dunes",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      budget_range: "2-3L",
      amount: 100000,
      created_by: managerUser.id,
    }).select().single();
    const { data: quoteDay } = await adminClient.from("quotation_function_days").insert({
      quotation_id: quotation.id,
      day_index: 1,
      day_date: "2026-08-08",
      first_event_id: event.id,
    }).select().single();
    await adminClient.from("quotation_function_day_services").insert({
      quotation_function_day_id: quoteDay.id,
      service_id: service.id,
    });
    await adminClient.from("quotation_deliverables").insert({
      quotation_id: quotation.id,
      deliverable_id: deliverable.id,
    });
    await adminClient.from("quotation_service_persons").insert({
      quotation_id: quotation.id,
      service_id: service.id,
      person_count: 2,
    });

    await expect(
      updateQuotationDeliverables(
        quotation.id,
        ["00000000-0000-0000-0000-000000000999"],
        [{ service_id: service.id, person_count: 4 }]
      )
    ).rejects.toThrow();

    const { data: deliverablesAfter } = await adminClient
      .from("quotation_deliverables")
      .select("deliverable_id")
      .eq("quotation_id", quotation.id);
    const { data: servicePersonsAfter } = await adminClient
      .from("quotation_service_persons")
      .select("service_id, person_count")
      .eq("quotation_id", quotation.id);

    expect(deliverablesAfter).toEqual([{ deliverable_id: deliverable.id }]);
    expect(servicePersonsAfter).toEqual([{ service_id: service.id, person_count: 2 }]);
  });

  it("successfully replaces quotation selections exactly once", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: event } = await adminClient.from("events").insert({ name: "Quote Event B", status: "active" }).select().single();
    const { data: service1 } = await adminClient.from("services").insert({ name: "Quote Service B1", status: "active" }).select().single();
    const { data: service2 } = await adminClient.from("services").insert({ name: "Quote Service B2", status: "active" }).select().single();
    const { data: deliverable1 } = await adminClient.from("deliverables").insert({ title: "Quote Deliverable B1", status: "active" }).select().single();
    const { data: deliverable2 } = await adminClient.from("deliverables").insert({ title: "Quote Deliverable B2", status: "active" }).select().single();
    const { data: quotation } = await adminClient.from("quotations").insert({
      status: "pending",
      your_name: "Quote Client 2",
      couple_name: "Quote Couple 2",
      referral_source: "Instagram",
      contact_number: "9876543221",
      email: "quote2@example.com",
      event_location: "Kota",
      wedding_date: "2026-07-07",
      wedding_venue: "Garden",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      budget_range: "2-3L",
      amount: 110000,
      created_by: managerUser.id,
    }).select().single();
    const { data: quoteDay } = await adminClient.from("quotation_function_days").insert({
      quotation_id: quotation.id,
      day_index: 1,
      day_date: "2026-07-07",
      first_event_id: event.id,
    }).select().single();
    await adminClient.from("quotation_function_day_services").insert([
      {
        quotation_function_day_id: quoteDay.id,
        service_id: service1.id,
      },
      {
        quotation_function_day_id: quoteDay.id,
        service_id: service2.id,
      },
    ]);

    await updateQuotationDeliverables(
      quotation.id,
      [deliverable1.id, deliverable1.id, deliverable2.id],
      [
        { service_id: service1.id, person_count: 3 },
        { service_id: service2.id, person_count: 1 },
      ]
    );

    const { data: deliverablesAfter } = await adminClient
      .from("quotation_deliverables")
      .select("deliverable_id")
      .eq("quotation_id", quotation.id)
      .order("deliverable_id", { ascending: true });
    const { data: servicePersonsAfter } = await adminClient
      .from("quotation_service_persons")
      .select("service_id, person_count")
      .eq("quotation_id", quotation.id)
      .order("service_id", { ascending: true });

    expect(deliverablesAfter).toHaveLength(2);
    expect(servicePersonsAfter).toEqual(
      expect.arrayContaining([
        { service_id: service1.id, person_count: 3 },
        { service_id: service2.id, person_count: 1 },
      ])
    );

    await updateQuotationServicePersons(quotation.id, [{ service_id: service1.id, person_count: 5 }]);
    const { data: servicePersonsReplaced } = await adminClient
      .from("quotation_service_persons")
      .select("service_id, person_count")
      .eq("quotation_id", quotation.id);
    expect(servicePersonsReplaced).toEqual([{ service_id: service1.id, person_count: 5 }]);
  });

  it("rolls back master upsert and mapping sync if service mapping insert fails", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: service } = await adminClient.from("services").insert({ name: "Agency Service A", status: "active" }).select().single();
    const { data: agency } = await adminClient.from("agencies").insert({
      company_name: "Original Agency",
      person_name: "Original Contact",
      contact_number: "9876543230",
      address: "Old Address",
      status: "active",
    }).select().single();
    await adminClient.from("agency_services").insert({
      agency_id: agency.id,
      service_id: service.id,
    });

    await expect(
      upsertMaster({
        table: "agencies",
        id: agency.id,
        data: {
          company_name: "Updated Agency",
          person_name: "Updated Contact",
          contact_number: "9876543230",
          address: "New Address",
          status: "active",
        },
        serviceIds: ["00000000-0000-0000-0000-000000000998"],
      })
    ).rejects.toThrow();

    const { data: agencyAfter } = await adminClient
      .from("agencies")
      .select("company_name, person_name, address")
      .eq("id", agency.id)
      .single();
    const { data: mappingsAfter } = await adminClient
      .from("agency_services")
      .select("service_id")
      .eq("agency_id", agency.id);

    expect(agencyAfter).toEqual({
      company_name: "Original Agency",
      person_name: "Original Contact",
      address: "Old Address",
    });
    expect(mappingsAfter).toEqual([{ service_id: service.id }]);
  });

  it("does not create master service mappings when parent creation fails", async () => {
    if (!requireIntegrationReady()) return;

    const { data: service } = await adminClient.from("services").insert({ name: "Agency Service B", status: "active" }).select().single();
    const { error } = await managerClient.rpc("upsert_master_with_service_mappings", {
      p_table: "agencies",
      p_id: null,
      p_data: {
        person_name: "Missing Company",
        contact_number: "9876543231",
        status: "active",
      },
      p_service_ids: [service.id],
      p_test_run_id: testRunId,
      p_created_by_test: true,
    });

    expect(error).not.toBeNull();

    const { data: agenciesAfter } = await adminClient
      .from("agencies")
      .select("id")
      .eq("person_name", "Missing Company");
    const { count: mappingsCount } = await adminClient
      .from("agency_services")
      .select("*", { count: "exact", head: true })
      .eq("service_id", service.id)
      .eq("test_run_id", testRunId);

    expect(agenciesAfter ?? []).toHaveLength(0);
    expect(mappingsCount ?? 0).toBe(0);
  });

  it("successfully upserts master mappings exactly once", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: service1 } = await adminClient.from("services").insert({ name: "Crew Service A", status: "active" }).select().single();
    const { data: service2 } = await adminClient.from("services").insert({ name: "Crew Service B", status: "active" }).select().single();

    const crewMemberId = await upsertMaster({
      table: "crew_members",
      data: {
        name: "Atomic Crew",
        contact_number: "9876543232",
        address: "Crew Lane",
        status: "active",
      },
      serviceIds: [service1.id, service1.id, service2.id],
    });

    const { data: mappingsAfter } = await adminClient
      .from("crew_member_services")
      .select("service_id")
      .eq("crew_member_id", crewMemberId)
      .order("service_id", { ascending: true });

    expect(mappingsAfter).toHaveLength(2);
  });

  it("rolls back crew allocation replacement if a later insert fails", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: quotation } = await adminClient.from("quotations").insert({
      status: "pending",
      your_name: "Order Client",
      couple_name: "Order Couple",
      referral_source: "Instagram",
      contact_number: "9876543240",
      email: "order@example.com",
      event_location: "Bikaner",
      wedding_date: "2026-06-06",
      wedding_venue: "Fort",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      budget_range: "2-3L",
      amount: 125000,
      created_by: managerUser.id,
    }).select().single();
    const { data: order } = await adminClient.from("orders").insert({
      quotation_id: quotation.id,
      status: "pending",
      your_name: quotation.your_name,
      couple_name: quotation.couple_name,
      contact_number: quotation.contact_number,
      email: quotation.email,
      event_location: quotation.event_location,
      wedding_date: quotation.wedding_date,
      wedding_venue: quotation.wedding_venue,
      budget_range: quotation.budget_range,
      invoice_type: "non_gst",
      subtotal_amount: 125000,
      gst_rate: 0,
      gst_amount: 0,
      total_amount: 125000,
      created_by: managerUser.id,
    }).select().single();
    const { data: service } = await adminClient.from("services").insert({ name: "Order Service A", status: "active" }).select().single();
    const { data: orderService } = await adminClient.from("order_services").insert({
      order_id: order.id,
      service_id: service.id,
      person_count: 2,
    }).select().single();
    const { data: crew1 } = await adminClient.from("crew_members").insert({
      name: "Crew One",
      contact_number: "9876543241",
      status: "active",
    }).select().single();
    const { data: crew2 } = await adminClient.from("crew_members").insert({
      name: "Crew Two",
      contact_number: "9876543242",
      status: "active",
    }).select().single();
    await adminClient.from("order_service_allocations").insert({
      order_service_id: orderService.id,
      crew_member_id: crew1.id,
    });

    await expect(
      allocateCrew(order.id, orderService.id, [crew2.id, "00000000-0000-0000-0000-000000000997"])
    ).rejects.toThrow();

    const { data: allocationsAfter } = await adminClient
      .from("order_service_allocations")
      .select("crew_member_id")
      .eq("order_service_id", orderService.id);

    expect(allocationsAfter).toEqual([{ crew_member_id: crew1.id }]);
  });

  it("successfully replaces crew allocations exactly once", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = managerClient;

    const { data: quotation } = await adminClient.from("quotations").insert({
      status: "pending",
      your_name: "Order Client 2",
      couple_name: "Order Couple 2",
      referral_source: "Instagram",
      contact_number: "9876543243",
      email: "order2@example.com",
      event_location: "Alwar",
      wedding_date: "2026-05-05",
      wedding_venue: "Green Estate",
      album_requirement: "yes_large",
      drone_requirement: "one_drone",
      shooting_side: "both",
      pre_wedding_shoot: "yes_local",
      functions_count: 1,
      has_additional_info: false,
      budget_range: "2-3L",
      amount: 95000,
      created_by: managerUser.id,
    }).select().single();
    const { data: order } = await adminClient.from("orders").insert({
      quotation_id: quotation.id,
      status: "pending",
      your_name: quotation.your_name,
      couple_name: quotation.couple_name,
      contact_number: quotation.contact_number,
      email: quotation.email,
      event_location: quotation.event_location,
      wedding_date: quotation.wedding_date,
      wedding_venue: quotation.wedding_venue,
      budget_range: quotation.budget_range,
      invoice_type: "non_gst",
      subtotal_amount: 95000,
      gst_rate: 0,
      gst_amount: 0,
      total_amount: 95000,
      created_by: managerUser.id,
    }).select().single();
    const { data: service } = await adminClient.from("services").insert({ name: "Order Service B", status: "active" }).select().single();
    const { data: orderService } = await adminClient.from("order_services").insert({
      order_id: order.id,
      service_id: service.id,
      person_count: 2,
    }).select().single();
    const { data: crew1 } = await adminClient.from("crew_members").insert({
      name: "Crew Three",
      contact_number: "9876543244",
      status: "active",
    }).select().single();
    const { data: crew2 } = await adminClient.from("crew_members").insert({
      name: "Crew Four",
      contact_number: "9876543245",
      status: "active",
    }).select().single();

    await allocateCrew(order.id, orderService.id, [crew1.id, crew1.id, crew2.id]);

    const { data: allocationsAfter } = await adminClient
      .from("order_service_allocations")
      .select("crew_member_id")
      .eq("order_service_id", orderService.id)
      .order("crew_member_id", { ascending: true });

    expect(allocationsAfter).toHaveLength(2);
  });
});
