"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import {
  ALBUM_OPTIONS,
  BUDGET_RANGES,
  DRONE_OPTIONS,
  LEAD_REFERRAL_OPTIONS,
  LEAD_STATUSES,
  PRE_WEDDING_OPTIONS,
  SHOOTING_SIDE_OPTIONS,
} from "@/lib/constants";
import { rateLimitKey } from "@/lib/security/rate-limit";
import type { LeadSource } from "@/types/database";
import { withSafeError } from "@/lib/security/errors";

export interface FunctionDayInput {
  day_index: number;
  day_date: string;
  first_event_id: string;
  second_event_id?: string;
  service_ids: string[];
}

export interface LeadFormInput {
  your_name: string;
  couple_name: string;
  referral_source: string;
  contact_number: string;
  email?: string;
  event_location: string;
  wedding_date: string;
  wedding_venue?: string;
  album_requirement: string;
  drone_requirement: string;
  shooting_side: string;
  pre_wedding_shoot: string;
  functions_count: number;
  has_additional_info: boolean;
  additional_details?: string;
  agreement_accepted: boolean;
  budget_range: string;
  function_days: FunctionDayInput[];
  source?: LeadSource;
  status?: string;
}

const leadStatusValues = LEAD_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

const trimmedText = (max: number) =>
  z.string().trim().min(1, "Required").max(max, `Must be ${max} characters or less`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or less`)
    .optional()
    .transform((value) => value || undefined);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid date");

const functionDaySchema = z
  .object({
    day_index: z.number().int().min(1).max(30),
    day_date: dateString,
    first_event_id: z.string().uuid(),
    second_event_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || undefined),
    service_ids: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict()
  .transform((day) => ({
    ...day,
    service_ids: Array.from(new Set(day.service_ids)),
  }));

const leadInputSchema = z
  .object({
    your_name: trimmedText(80).regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/, "Invalid name"),
    couple_name: trimmedText(120).regex(/^[A-Za-zÀ-ÖØ-öø-ÿ' &-]+$/, "Invalid couple name"),
    referral_source: z.enum(LEAD_REFERRAL_OPTIONS),
    contact_number: z.string().trim().regex(/^\+?\d{10}$/, "Invalid contact number"),
    email: z.email().max(254).optional().or(z.literal("")).transform((value) => value || undefined),
    event_location: trimmedText(160),
    wedding_date: dateString,
    wedding_venue: optionalText(160),
    album_requirement: z.enum(ALBUM_OPTIONS),
    drone_requirement: z.enum(DRONE_OPTIONS),
    shooting_side: z.enum(SHOOTING_SIDE_OPTIONS),
    pre_wedding_shoot: z.enum(PRE_WEDDING_OPTIONS),
    functions_count: z.number().int().min(1).max(30),
    has_additional_info: z.boolean(),
    additional_details: optionalText(2000),
    agreement_accepted: z.literal(true),
    budget_range: z.enum(BUDGET_RANGES),
    function_days: z.array(functionDaySchema).min(1).max(30),
    source: z.enum(["public_form", "admin_manual", "user_management"]).optional(),
    status: z.enum(leadStatusValues).optional(),
  })
  .strict()
  .refine((input) => input.function_days.length === input.functions_count, {
    path: ["function_days"],
    message: "Function day count must match functions count",
  })
  .refine(
    (input) => !input.has_additional_info || Boolean(input.additional_details?.trim()),
    { path: ["additional_details"], message: "Additional details are required" }
  );

async function getClientIp() {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown"
  );
}

async function assertActiveReferences(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  days: FunctionDayInput[]
) {
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

export async function createLead(input: LeadFormInput) {
  return withSafeError(async () => {
    const parsed = leadInputSchema.parse(input);
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (user) {
      await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    } else {
      const ip = await getClientIp();
      const { data: allowed, error: limitError } = await authClient.rpc("check_rate_limit", {
        limit_key: rateLimitKey("public-lead", ip),
        max_tokens: 5.0,
        refill_rate_per_sec: 5.0 / 3600.0,
        cost: 1.0,
      });
      if (limitError || !allowed) {
        throw new Error("Too many inquiry submissions. Please try again later.");
      }
    }

    const source: LeadSource = user ? "admin_manual" : "public_form";
    const status = user ? parsed.status : "pending";

    // Public form: use service role so RLS does not block insert + select
    const supabase =
      source === "public_form" ? createAdminClient() : authClient;

    await assertActiveReferences(supabase, parsed.function_days);

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        source,
        status,
        your_name: parsed.your_name,
        couple_name: parsed.couple_name,
        referral_source: parsed.referral_source,
        contact_number: parsed.contact_number,
        email: parsed.email || null,
        event_location: parsed.event_location,
        wedding_date: parsed.wedding_date,
        wedding_venue: parsed.wedding_venue || null,
        album_requirement: parsed.album_requirement,
        drone_requirement: parsed.drone_requirement,
        shooting_side: parsed.shooting_side,
        pre_wedding_shoot: parsed.pre_wedding_shoot,
        functions_count: parsed.functions_count,
        has_additional_info: parsed.has_additional_info,
        additional_details: parsed.additional_details || null,
        agreement_accepted: parsed.agreement_accepted,
        budget_range: parsed.budget_range,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !lead) throw new Error(error?.message ?? "Failed to create lead");

    for (const day of parsed.function_days) {
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

      if (dayError || !dayRow) throw new Error(dayError?.message ?? "Failed to save function day");

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

    revalidatePath("/leads");
    return lead.id;
  });
}

export async function updateLeadStatus(id: string, status: string) {
  return withSafeError(async () => {
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
  });
}

export async function convertLeadToQuotation(
  leadId: string,
  servicePersons: { service_id: string; person_count: number }[] = [],
  deliverableIds: string[] = [],
  amount = 0
) {
  return withSafeError(async () => {
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

    revalidatePath("/leads");
    revalidatePath("/quotations");
    return quotationId as string;
  });
}

export async function deleteLead(id: string) {
  return withSafeError(async () => {
    await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
    const supabase = await createClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/leads");
  });
}

export async function updateLead(id: string, input: LeadFormInput) {
  return withSafeError(async () => {
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const parsed = leadInputSchema.parse(input);
    const supabase = await createClient();
    await assertActiveReferences(supabase, parsed.function_days);

    const updatePayload: Record<string, unknown> = {
      your_name: parsed.your_name,
      couple_name: parsed.couple_name,
      referral_source: parsed.referral_source,
      contact_number: parsed.contact_number,
      email: parsed.email || null,
      event_location: parsed.event_location,
      wedding_date: parsed.wedding_date,
      wedding_venue: parsed.wedding_venue || null,
      album_requirement: parsed.album_requirement,
      drone_requirement: parsed.drone_requirement,
      shooting_side: parsed.shooting_side,
      pre_wedding_shoot: parsed.pre_wedding_shoot,
      functions_count: parsed.functions_count,
      has_additional_info: parsed.has_additional_info,
      additional_details: parsed.additional_details || null,
      budget_range: parsed.budget_range,
    };

    if (parsed.status) {
      updatePayload.status = parsed.status;
    }

    const { error } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", id);

    if (error) throw new Error(error.message);

    // Sync lead function days (delete and re-create)
    await supabase.from("lead_function_days").delete().eq("lead_id", id);

    for (const day of parsed.function_days) {
      const { data: dayRow, error: dayError } = await supabase
        .from("lead_function_days")
        .insert({
          lead_id: id,
          day_index: day.day_index,
          day_date: day.day_date,
          first_event_id: day.first_event_id || null,
          second_event_id: day.second_event_id || null,
        })
        .select("id")
        .single();

      if (dayError || !dayRow) throw new Error(dayError?.message ?? "Failed to save function day");

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

    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
  });
}
