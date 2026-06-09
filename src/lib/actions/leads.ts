"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import type { LeadSource } from "@/types/database";

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

export async function createLead(input: LeadFormInput) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const source: LeadSource =
    input.source ?? (user ? "admin_manual" : "public_form");

  // Public form: use service role so RLS does not block insert + select
  const supabase =
    source === "public_form" ? createAdminClient() : authClient;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      source,
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
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !lead) throw new Error(error?.message ?? "Failed to create lead");

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
}

export async function updateLeadStatus(id: string, status: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
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

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*, lead_function_days(*, lead_function_day_services(service_id))")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const { data: quotation, error: qError } = await supabase
    .from("quotations")
    .insert({
      your_name: lead.your_name,
      couple_name: lead.couple_name,
      referral_source: lead.referral_source,
      contact_number: lead.contact_number,
      email: lead.email,
      event_location: lead.event_location,
      wedding_date: lead.wedding_date,
      wedding_venue: lead.wedding_venue,
      album_requirement: lead.album_requirement,
      drone_requirement: lead.drone_requirement,
      shooting_side: lead.shooting_side,
      pre_wedding_shoot: lead.pre_wedding_shoot,
      functions_count: lead.functions_count,
      has_additional_info: lead.has_additional_info,
      additional_details: lead.additional_details,
      budget_range: lead.budget_range,
      original_lead_id: lead.id,
      created_by: user?.id ?? null,
      amount,
    })
    .select("id")
    .single();

  if (qError || !quotation) throw new Error(qError?.message ?? "Failed to create quotation");

  for (const day of lead.lead_function_days ?? []) {
    const { data: qDay, error: dayError } = await supabase
      .from("quotation_function_days")
      .insert({
        quotation_id: quotation.id,
        day_index: day.day_index,
        day_date: day.day_date,
        first_event_id: day.first_event_id,
        second_event_id: day.second_event_id,
      })
      .select("id")
      .single();

    if (dayError || !qDay) throw new Error(dayError?.message ?? "Failed to copy function days");

    const serviceIds = (day.lead_function_day_services ?? []).map(
      (s: { service_id: string }) => s.service_id
    );
    if (serviceIds.length > 0) {
      await supabase.from("quotation_function_day_services").insert(
        serviceIds.map((service_id: string) => ({
          quotation_function_day_id: qDay.id,
          service_id,
        }))
      );
    }
  }

  // Save service person counts
  if (servicePersons.length > 0) {
    const { error: spError } = await supabase.from("quotation_service_persons").insert(
      servicePersons.map((sp) => ({
        quotation_id: quotation.id,
        service_id: sp.service_id,
        person_count: sp.person_count,
      }))
    );
    if (spError) throw new Error(spError.message);
  }

  // Save selected deliverables
  if (deliverableIds.length > 0) {
    const { error: delError } = await supabase.from("quotation_deliverables").insert(
      deliverableIds.map((deliverable_id) => ({
        quotation_id: quotation.id,
        deliverable_id,
      }))
    );
    if (delError) throw new Error(delError.message);
  }

  // Delete the lead from the leads table upon conversion
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId);

  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/leads");
  revalidatePath("/quotations");
  return quotation.id;
}

export async function deleteLead(id: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function updateLead(id: string, input: LeadFormInput) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();

  const updatePayload: any = {
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

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Sync lead function days (delete and re-create)
  await supabase.from("lead_function_days").delete().eq("lead_id", id);

  for (const day of input.function_days) {
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
}
