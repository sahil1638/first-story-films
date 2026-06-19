import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow, requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { Lead } from "@/types/database";
import type { LeadFormInput, FunctionDayInput } from "@/lib/actions/leads";

export interface LeadFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  budget?: string;
  functions?: string;
  dateStart?: string;
  dateEnd?: string;
}

const MAX_PAGE_SIZE = 100;
const POSTGREST_OR_RESERVED_CHARS = /[%_.,()]/g;

function normalizePage(value?: number) {
  return Math.max(1, Number.isFinite(value ?? NaN) ? Number(value) : 1);
}

function normalizeLimit(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return 20;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Number(value)));
}

function sanitizePostgrestSearch(value?: string) {
  const cleaned = value?.trim().replace(POSTGREST_OR_RESERVED_CHARS, " ").replace(/\s+/g, " ");
  return cleaned && cleaned.length >= 2 ? cleaned.slice(0, 80) : undefined;
}

export async function getLeads(filters: LeadFilters = {}) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = sanitizePostgrestSearch(filters.search);

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("*, lead_function_days(*, lead_function_day_services(service_id))", { count: "exact" });

  if (search) {
    query = query.or(
      `your_name.ilike.%${search}%,couple_name.ilike.%${search}%,contact_number.ilike.%${search}%,email.ilike.%${search}%,event_location.ilike.%${search}%`
    );
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.budget && filters.budget !== "all") {
    query = query.eq("budget_range", filters.budget);
  }
  if (filters.functions && filters.functions !== "all") {
    query = query.eq("functions_count", Number(filters.functions));
  }
  if (filters.dateStart) {
    query = query.gte("wedding_date", filters.dateStart);
  }
  if (filters.dateEnd) {
    query = query.lte("wedding_date", filters.dateEnd);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || "Failed to fetch leads");
  }

  return {
    leads: (data ?? []) as Lead[],
    count: count ?? 0,
  };
}

export async function getLeadById(id: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*, lead_function_days(*, lead_function_day_services(service_id))")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to fetch lead");
  }
  return data;
}

async function assertActiveReferences(days: FunctionDayInput[]) {
  const supabase = await createClient();
  const eventIds = Array.from(
    new Set(days.flatMap((day) => [day.first_event_id, day.second_event_id].filter(Boolean)))
  ) as string[];
  const serviceIds = Array.from(new Set(days.flatMap((day) => day.service_ids)));

  if (eventIds.length > 0) {
    const { data, error } = await supabase
      .from("events")
      .select("id")
      .in("id", eventIds)
      .eq("status", "active");
    if (error) throw new Error("Unable to validate selected events");
    if ((data ?? []).length !== eventIds.length) {
      throw new Error("One or more selected events are unavailable");
    }
  }

  if (serviceIds.length > 0) {
    const { data, error } = await supabase
      .from("services")
      .select("id")
      .in("id", serviceIds)
      .eq("status", "active");
    if (error) throw new Error("Unable to validate selected services");
    if ((data ?? []).length !== serviceIds.length) {
      throw new Error("One or more selected services are unavailable");
    }
  }
}

export async function createAdminLead(input: LeadFormInput) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  await assertActiveReferences(input.function_days);

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      source: "admin_manual",
      status: input.status || "pending",
      your_name: input.your_name,
      couple_name: input.couple_name,
      referral_source: input.referral_source,
      contact_number: input.contact_number,
      email: input.email || null,
      event_location: input.event_location,
      wedding_date: input.wedding_date,
      wedding_venue: input.wedding_venue || null,
      album_requirement: input.album_requirement,
      drone_requirement: input.drone_requirement,
      shooting_side: input.shooting_side,
      pre_wedding_shoot: input.pre_wedding_shoot,
      functions_count: input.functions_count,
      has_additional_info: input.has_additional_info,
      additional_details: input.additional_details || null,
      agreement_accepted: input.agreement_accepted,
      budget_range: input.budget_range,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !lead) {
    throw new Error(error?.message ?? "Failed to create lead");
  }

  for (const day of input.function_days) {
    const { data: dayRow, error: dayError } = await supabase
      .from("lead_function_days")
      .insert({
        lead_id: lead.id,
        day_index: day.day_index,
        day_date: day.day_date,
        first_event_id: day.first_event_id || null,
        second_event_id: day.second_event_id || null,
      })
      .select("id")
      .single();

    if (dayError || !dayRow) {
      throw new Error(dayError?.message ?? "Failed to save function day");
    }

    if (day.service_ids.length > 0) {
      const { error: svcError } = await supabase.from("lead_function_day_services").insert(
        day.service_ids.map((service_id) => ({
          lead_function_day_id: dayRow.id,
          service_id,
        }))
      );
      if (svcError) throw new Error(svcError.message);
    }
  }

  return lead.id;
}

export async function updateLead(id: string, input: LeadFormInput) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    your_name: input.your_name,
    couple_name: input.couple_name,
    referral_source: input.referral_source,
    contact_number: input.contact_number,
    email: input.email || null,
    event_location: input.event_location,
    wedding_date: input.wedding_date,
    wedding_venue: input.wedding_venue || null,
    album_requirement: input.album_requirement,
    drone_requirement: input.drone_requirement,
    shooting_side: input.shooting_side,
    pre_wedding_shoot: input.pre_wedding_shoot,
    functions_count: input.functions_count,
    has_additional_info: input.has_additional_info,
    additional_details: input.additional_details || null,
    budget_range: input.budget_range,
  };

  if (input.status) {
    updatePayload.status = input.status;
  }

  const { error } = await supabase.rpc("update_lead_with_function_days", {
    p_lead_id: id,
    p_lead: updatePayload,
    p_function_days: input.function_days,
  });
  if (error) throw new Error(error.message);
}

export async function updateLeadStatus(id: string, status: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function convertLeadToQuotation(
  leadId: string,
  servicePersons: { service_id: string; person_count: number }[] = [],
  deliverableIds: string[] = [],
  amount = 0
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: quotationId, error } = await supabase.rpc("convert_lead_to_quotation", {
    lead_id: leadId,
    amount,
    service_persons: servicePersons,
    deliverable_ids: deliverableIds,
    created_by_user: user?.id ?? null,
  });

  if (error || !quotationId) {
    throw new Error(error?.message ?? "Failed to convert lead to quotation");
  }

  return quotationId as string;
}

export async function deleteLead(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateLeadAdminNotes(id: string, notes: string | null) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ admin_notes: notes })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
