import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import type { Quotation, InvoiceType } from "@/types/database";

export interface QuotationFilters {
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

export async function getQuotations(filters: QuotationFilters = {}): Promise<{ quotations: Quotation[]; count: number }> {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = sanitizePostgrestSearch(filters.search);

  const supabase = await createClient();
  let query = supabase
    .from("quotations")
    .select("*", { count: "exact" });

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
    throw new Error(error.message || "Failed to fetch quotations");
  }
  return {
    quotations: (data ?? []) as Quotation[],
    count: count ?? 0,
  };
}

export async function getQuotationById(id: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to fetch quotation");
  }
  return data;
}

export async function updateQuotationDeliverables(
  quotationId: string,
  deliverableIds: string[],
  servicePersons: { service_id: string; person_count: number }[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_quotation_selections", {
    p_quotation_id: quotationId,
    p_deliverable_ids: Array.from(new Set(deliverableIds.filter(Boolean))),
    p_service_persons: servicePersons,
    p_replace_deliverables: true,
    p_replace_service_persons: true,
    p_filter_service_persons_to_selected: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateQuotationServicePersons(
  quotationId: string,
  servicePersons: { service_id: string; person_count: number }[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();

  const normalized = servicePersons
    .map((sp) => ({
      service_id: sp.service_id,
      person_count: Math.max(1, Number(sp.person_count) || 1),
    }))
    .filter((sp) => Boolean(sp.service_id));

  const { error } = await supabase.rpc("replace_quotation_selections", {
    p_quotation_id: quotationId,
    p_deliverable_ids: [],
    p_service_persons: normalized,
    p_replace_deliverables: false,
    p_replace_service_persons: true,
    p_filter_service_persons_to_selected: false,
  });
  if (error) throw new Error(error.message);
}

export async function updateQuotationDeliverableSelection(
  quotationId: string,
  deliverableIds: string[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const uniqueIds = Array.from(new Set(deliverableIds.filter(Boolean)));

  const { error } = await supabase.rpc("replace_quotation_selections", {
    p_quotation_id: quotationId,
    p_deliverable_ids: uniqueIds,
    p_service_persons: [],
    p_replace_deliverables: true,
    p_replace_service_persons: false,
    p_filter_service_persons_to_selected: false,
  });
  if (error) throw new Error(error.message);
}

export async function updateQuotationTerms(
  quotationId: string,
  terms: string
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotations")
    .update({ terms_and_conditions: terms.trim() || null })
    .eq("id", quotationId);

  if (error) throw new Error(error.message);
}

export async function updateQuotationStatus(id: string, status: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  const { data: order, error: orderFetchError } = await supabase
    .from("orders")
    .select("id")
    .eq("quotation_id", id)
    .maybeSingle();

  if (orderFetchError) throw new Error(orderFetchError.message);

  if (order) {
    const orderStatus = status === "cancelled" ? "cancelled" : "pending";
    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: orderStatus })
      .eq("id", order.id);

    if (orderError) throw new Error(orderError.message);
  }
}

export async function convertQuotationToOrder(
  quotationId: string,
  subtotalAmount = 0,
  invoiceType: InvoiceType = "non_gst",
  servicePersons?: { service_id: string; person_count: number }[],
  deliverableIds?: string[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))")
    .eq("id", quotationId)
    .single();

  if (error || !quotation) throw new Error("Quotation not found");
  if (quotation.status !== "pending") {
    throw new Error("Only pending quotations can be converted to orders");
  }

  const serviceMap = new Map<string, number>();
  for (const day of quotation.quotation_function_days ?? []) {
    for (const s of day.quotation_function_day_services ?? []) {
      serviceMap.set(s.service_id, (serviceMap.get(s.service_id) ?? 0) + 1);
    }
  }

  if (servicePersons && servicePersons.length > 0) {
    for (const sp of servicePersons) {
      serviceMap.set(sp.service_id, sp.person_count);
    }
  } else {
    for (const sp of quotation.quotation_service_persons ?? []) {
      serviceMap.set(sp.service_id, sp.person_count);
    }
  }

  const resolvedServicePersons = Array.from(serviceMap.entries()).map(([service_id, person_count]) => ({
    service_id,
    person_count,
  }));

  const selectedDeliverableIds =
    deliverableIds && deliverableIds.length > 0
      ? deliverableIds
      : (quotation.quotation_deliverables ?? []).map(
          (deliverable: { deliverable_id: string }) => deliverable.deliverable_id
        );
  const resolvedDeliverableIds = Array.from(new Set(selectedDeliverableIds.filter(Boolean)));

  const { data: orderId, error: convertError } = await supabase.rpc("convert_quotation_to_order", {
    quotation_id: quotationId,
    subtotal: subtotalAmount,
    invoice_type: invoiceType,
    service_persons: resolvedServicePersons,
    deliverable_ids: resolvedDeliverableIds,
    created_by_user: user?.id ?? null,
  });

  if (convertError || !orderId) {
    throw new Error(convertError?.message ?? "Failed to convert quotation to order");
  }

  return orderId as string;
}

export async function deleteQuotation(id: string) {
  await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateQuotationBasic(
  id: string,
  data: {
    couple_name: string;
    your_name: string;
    contact_number: string;
    email?: string;
    event_location: string;
    wedding_date: string;
    wedding_venue?: string;
    budget_range: string;
    status?: string;
    amount?: number;
  }
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    couple_name: data.couple_name,
    your_name: data.your_name,
    contact_number: data.contact_number,
    email: data.email || null,
    event_location: data.event_location,
    wedding_date: data.wedding_date,
    wedding_venue: data.wedding_venue || null,
    budget_range: data.budget_range,
  };

  if (data.status) {
    updatePayload.status = data.status;
  }

  if (typeof data.amount === "number") {
    updatePayload.amount = data.amount;
  }

  const { error } = await supabase
    .from("quotations")
    .update(updatePayload)
    .eq("id", id);

  if (error) throw new Error(error.message);

  const { data: order, error: orderFetchError } = await supabase
    .from("orders")
    .select("id")
    .eq("quotation_id", id)
    .maybeSingle();

  if (orderFetchError) throw new Error(orderFetchError.message);

  if (order) {
    const orderPayload: Record<string, unknown> = {
      couple_name: data.couple_name,
      your_name: data.your_name,
      contact_number: data.contact_number,
      email: data.email || null,
      event_location: data.event_location,
      wedding_date: data.wedding_date,
      wedding_venue: data.wedding_venue || null,
      budget_range: data.budget_range,
    };

    if (data.status) {
      orderPayload.status = data.status === "cancelled" ? "cancelled" : "pending";
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update(orderPayload)
      .eq("id", order.id);

    if (orderError) throw new Error(orderError.message);
  }
}

export async function updateQuotationAdminNotes(id: string, notes: string | null) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("quotations")
    .update({ admin_notes: notes })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
