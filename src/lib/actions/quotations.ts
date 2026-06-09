"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { GST_RATE_PERCENT, calculateOrderBilling } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";

const VALID_QUOTATION_STATUSES = ["pending", "convert_to_order", "cancelled"] as const;

type ValidQuotationStatus = (typeof VALID_QUOTATION_STATUSES)[number];

export async function updateQuotationDeliverables(
  quotationId: string,
  deliverableIds: string[],
  servicePersons: { service_id: string; person_count: number }[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { data: quotationDays, error: quotationDaysError } = await supabase
    .from("quotation_function_days")
    .select("quotation_function_day_services(service_id)")
    .eq("quotation_id", quotationId);

  if (quotationDaysError) throw new Error(quotationDaysError.message);

  const selectedServiceIds = new Set<string>();
  for (const day of quotationDays ?? []) {
    for (const service of day.quotation_function_day_services ?? []) {
      selectedServiceIds.add(service.service_id);
    }
  }
  const selectedServicePersons = servicePersons.filter((sp) => selectedServiceIds.has(sp.service_id));

  await supabase.from("quotation_deliverables").delete().eq("quotation_id", quotationId);
  await supabase.from("quotation_service_persons").delete().eq("quotation_id", quotationId);

  if (deliverableIds.length > 0) {
    await supabase.from("quotation_deliverables").insert(
      deliverableIds.map((deliverable_id) => ({ quotation_id: quotationId, deliverable_id }))
    );
  }

  if (selectedServicePersons.length > 0) {
    await supabase.from("quotation_service_persons").insert(
      selectedServicePersons.map((sp) => ({
        quotation_id: quotationId,
        service_id: sp.service_id,
        person_count: sp.person_count,
      }))
    );
  }

  revalidatePath(`/quotations/${quotationId}`);
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

  await supabase.from("quotation_service_persons").delete().eq("quotation_id", quotationId);

  if (normalized.length > 0) {
    const { error } = await supabase.from("quotation_service_persons").insert(
      normalized.map((sp) => ({
        quotation_id: quotationId,
        service_id: sp.service_id,
        person_count: sp.person_count,
      }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/quotations/${quotationId}`);
}

export async function updateQuotationDeliverableSelection(
  quotationId: string,
  deliverableIds: string[]
) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const uniqueIds = Array.from(new Set(deliverableIds.filter(Boolean)));

  await supabase.from("quotation_deliverables").delete().eq("quotation_id", quotationId);

  if (uniqueIds.length > 0) {
    const { error } = await supabase.from("quotation_deliverables").insert(
      uniqueIds.map((deliverable_id) => ({ quotation_id: quotationId, deliverable_id }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/quotations/${quotationId}`);
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
  revalidatePath(`/quotations/${quotationId}`);
}

export async function updateQuotationStatus(id: string, status: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  if (!VALID_QUOTATION_STATUSES.includes(status as ValidQuotationStatus)) {
    throw new Error("Invalid quotation status");
  }
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

    revalidatePath("/orders");
    revalidatePath(`/orders/${order.id}`);
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
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
  if (!["gst", "non_gst"].includes(invoiceType)) {
    throw new Error("Select a valid invoice type");
  }

  const billing = calculateOrderBilling(subtotalAmount, invoiceType);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      quotation_id: quotationId,
      your_name: quotation.your_name,
      couple_name: quotation.couple_name,
      contact_number: quotation.contact_number,
      email: quotation.email,
      event_location: quotation.event_location,
      wedding_date: quotation.wedding_date,
      wedding_venue: quotation.wedding_venue,
      budget_range: quotation.budget_range,
      invoice_type: invoiceType,
      subtotal_amount: billing.baseAmount,
      gst_rate: invoiceType === "gst" ? GST_RATE_PERCENT : 0,
      gst_amount: billing.gstAmount,
      total_amount: billing.totalAmount,
      customer_id: null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (orderError || !order) throw new Error(String(orderError ?? "Failed to create order"));

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      couple_name: quotation.your_name,
      contact_number: quotation.contact_number,
      email: quotation.email,
      order_id: order.id,
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    await supabase.from("orders").delete().eq("id", order.id);
    throw new Error(String(customerError ?? "Failed to create customer"));
  }

  const { error: linkError } = await supabase
    .from("orders")
    .update({ customer_id: customer.id })
    .eq("id", order.id);

  if (linkError) {
    await supabase.from("customers").delete().eq("id", customer.id);
    await supabase.from("orders").delete().eq("id", order.id);
    throw new Error(String(linkError));
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

  const orderServices = Array.from(serviceMap.entries()).map(([service_id, person_count]) => ({
    order_id: order.id,
    service_id,
    person_count,
  }));

  if (orderServices.length > 0) {
    await supabase.from("order_services").insert(orderServices);
  }

  const selectedDeliverableIds =
    deliverableIds && deliverableIds.length > 0
      ? deliverableIds
      : (quotation.quotation_deliverables ?? []).map(
          (deliverable: { deliverable_id: string }) => deliverable.deliverable_id
        );
  const uniqueDeliverableIds = Array.from(new Set(selectedDeliverableIds.filter(Boolean)));

  if (uniqueDeliverableIds.length > 0) {
    const { error: deliverablesError } = await supabase.from("order_deliverables").insert(
      uniqueDeliverableIds.map((deliverable_id) => ({
        order_id: order.id,
        deliverable_id,
      }))
    );
    if (deliverablesError) throw new Error(deliverablesError.message);
  }

  await supabase.from("quotations").update({ status: "convert_to_order" }).eq("id", quotationId);

  revalidatePath("/quotations");
  revalidatePath("/orders");
  return order.id;
}

export async function deleteQuotation(id: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/quotations");
}

export async function updateQuotationBasic(
  id: string,
  data: {
    couple_name: string;
    your_name: string;
    contact_number: string;
    email: string;
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

  const updatePayload: any = {
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
    const orderPayload: any = {
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

    revalidatePath("/orders");
    revalidatePath(`/orders/${order.id}`);
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}
