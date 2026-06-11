"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { GST_RATE_PERCENT, calculateOrderBilling } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";
import {
  uuidSchema,
  updateQuotationDeliverablesSchema,
  updateQuotationServicePersonsSchema,
  updateQuotationDeliverableSelectionSchema,
  updateQuotationTermsSchema,
  updateQuotationStatusSchema,
  convertQuotationToOrderSchema,
  updateQuotationBasicSchema,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";

const VALID_QUOTATION_STATUSES = ["pending", "convert_to_order", "cancelled"] as const;
type ValidQuotationStatus = (typeof VALID_QUOTATION_STATUSES)[number];

export async function updateQuotationDeliverables(
  quotationId: string,
  deliverableIds: string[],
  servicePersons: { service_id: string; person_count: number }[]
) {
  return withSafeError(async () => {
    const parsed = updateQuotationDeliverablesSchema.parse({
      quotationId,
      deliverableIds,
      servicePersons,
    });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();
    const { data: quotationDays, error: quotationDaysError } = await supabase
      .from("quotation_function_days")
      .select("quotation_function_day_services(service_id)")
      .eq("quotation_id", parsed.quotationId);

    if (quotationDaysError) throw new Error(quotationDaysError.message);

    const selectedServiceIds = new Set<string>();
    for (const day of quotationDays ?? []) {
      for (const service of day.quotation_function_day_services ?? []) {
        selectedServiceIds.add(service.service_id);
      }
    }
    const selectedServicePersons = parsed.servicePersons.filter((sp) => selectedServiceIds.has(sp.service_id));

    await supabase.from("quotation_deliverables").delete().eq("quotation_id", parsed.quotationId);
    await supabase.from("quotation_service_persons").delete().eq("quotation_id", parsed.quotationId);

    if (parsed.deliverableIds.length > 0) {
      await supabase.from("quotation_deliverables").insert(
        parsed.deliverableIds.map((deliverable_id) => ({ quotation_id: parsed.quotationId, deliverable_id }))
      );
    }

    if (selectedServicePersons.length > 0) {
      await supabase.from("quotation_service_persons").insert(
        selectedServicePersons.map((sp) => ({
          quotation_id: parsed.quotationId,
          service_id: sp.service_id,
          person_count: sp.person_count,
        }))
      );
    }

    revalidatePath(`/quotations/${parsed.quotationId}`);
  });
}

export async function updateQuotationServicePersons(
  quotationId: string,
  servicePersons: { service_id: string; person_count: number }[]
) {
  return withSafeError(async () => {
    const parsed = updateQuotationServicePersonsSchema.parse({
      quotationId,
      servicePersons,
    });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();

    const normalized = parsed.servicePersons
      .map((sp) => ({
        service_id: sp.service_id,
        person_count: Math.max(1, Number(sp.person_count) || 1),
      }))
      .filter((sp) => Boolean(sp.service_id));

    await supabase.from("quotation_service_persons").delete().eq("quotation_id", parsed.quotationId);

    if (normalized.length > 0) {
      const { error } = await supabase.from("quotation_service_persons").insert(
        normalized.map((sp) => ({
          quotation_id: parsed.quotationId,
          service_id: sp.service_id,
          person_count: sp.person_count,
        }))
      );
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/quotations/${parsed.quotationId}`);
  });
}

export async function updateQuotationDeliverableSelection(
  quotationId: string,
  deliverableIds: string[]
) {
  return withSafeError(async () => {
    const parsed = updateQuotationDeliverableSelectionSchema.parse({
      quotationId,
      deliverableIds,
    });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();
    const uniqueIds = Array.from(new Set(parsed.deliverableIds.filter(Boolean)));

    await supabase.from("quotation_deliverables").delete().eq("quotation_id", parsed.quotationId);

    if (uniqueIds.length > 0) {
      const { error } = await supabase.from("quotation_deliverables").insert(
        uniqueIds.map((deliverable_id) => ({ quotation_id: parsed.quotationId, deliverable_id }))
      );
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/quotations/${parsed.quotationId}`);
  });
}

export async function updateQuotationTerms(
  quotationId: string,
  terms: string
) {
  return withSafeError(async () => {
    const parsed = updateQuotationTermsSchema.parse({ quotationId, terms });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();

    const { error } = await supabase
      .from("quotations")
      .update({ terms_and_conditions: parsed.terms.trim() || null })
      .eq("id", parsed.quotationId);

    if (error) throw new Error(error.message);
    revalidatePath(`/quotations/${parsed.quotationId}`);
  });
}

export async function updateQuotationStatus(id: string, status: string) {
  return withSafeError(async () => {
    const parsed = updateQuotationStatusSchema.parse({ id, status });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    if (!VALID_QUOTATION_STATUSES.includes(parsed.status as ValidQuotationStatus)) {
      throw new Error("Invalid quotation status");
    }
    const supabase = await createClient();
    const { error } = await supabase.from("quotations").update({ status: parsed.status }).eq("id", parsed.id);
    if (error) throw new Error(error.message);

    const { data: order, error: orderFetchError } = await supabase
      .from("orders")
      .select("id")
      .eq("quotation_id", parsed.id)
      .maybeSingle();

    if (orderFetchError) throw new Error(orderFetchError.message);

    if (order) {
      const orderStatus = parsed.status === "cancelled" ? "cancelled" : "pending";
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: orderStatus })
        .eq("id", order.id);

      if (orderError) throw new Error(orderError.message);

      revalidatePath("/orders");
      revalidatePath(`/orders/${order.id}`);
    }

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${parsed.id}`);
  });
}

export async function convertQuotationToOrder(
  quotationId: string,
  subtotalAmount = 0,
  invoiceType: InvoiceType = "non_gst",
  servicePersons?: { service_id: string; person_count: number }[],
  deliverableIds?: string[]
) {
  return withSafeError(async () => {
    const parsed = convertQuotationToOrderSchema.parse({
      quotationId,
      subtotalAmount,
      invoiceType,
      servicePersons,
      deliverableIds,
    });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: quotation, error } = await supabase
      .from("quotations")
      .select("*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))")
      .eq("id", parsed.quotationId)
      .single();

    if (error || !quotation) throw new Error("Quotation not found");
    if (quotation.status !== "pending") {
      throw new Error("Only pending quotations can be converted to orders");
    }
    if (!["gst", "non_gst"].includes(parsed.invoiceType)) {
      throw new Error("Select a valid invoice type");
    }

    const serviceMap = new Map<string, number>();
    for (const day of quotation.quotation_function_days ?? []) {
      for (const s of day.quotation_function_day_services ?? []) {
        serviceMap.set(s.service_id, (serviceMap.get(s.service_id) ?? 0) + 1);
      }
    }

    if (parsed.servicePersons && parsed.servicePersons.length > 0) {
      for (const sp of parsed.servicePersons) {
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
      parsed.deliverableIds && parsed.deliverableIds.length > 0
        ? parsed.deliverableIds
        : (quotation.quotation_deliverables ?? []).map(
            (deliverable: { deliverable_id: string }) => deliverable.deliverable_id
          );
    const resolvedDeliverableIds = Array.from(new Set(selectedDeliverableIds.filter(Boolean)));

    const { data: orderId, error: convertError } = await supabase.rpc("convert_quotation_to_order", {
      quotation_id: parsed.quotationId,
      subtotal: parsed.subtotalAmount,
      invoice_type: parsed.invoiceType,
      service_persons: resolvedServicePersons,
      deliverable_ids: resolvedDeliverableIds,
      created_by_user: user?.id ?? null,
    });

    if (convertError || !orderId) {
      throw new Error(convertError?.message ?? "Failed to convert quotation to order");
    }

    revalidatePath("/quotations");
    revalidatePath("/orders");
    return orderId as string;
  });
}

export async function deleteQuotation(id: string) {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
    const supabase = await createClient();
    const { error } = await supabase.from("quotations").delete().eq("id", parsedId);
    if (error) throw new Error(error.message);
    revalidatePath("/quotations");
  });
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
  return withSafeError(async () => {
    const parsed = updateQuotationBasicSchema.parse({ id, data });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = {
      couple_name: parsed.data.couple_name,
      your_name: parsed.data.your_name,
      contact_number: parsed.data.contact_number,
      email: parsed.data.email || null,
      event_location: parsed.data.event_location,
      wedding_date: parsed.data.wedding_date,
      wedding_venue: parsed.data.wedding_venue || null,
      budget_range: parsed.data.budget_range,
    };

    if (parsed.data.status) {
      updatePayload.status = parsed.data.status;
    }

    if (typeof parsed.data.amount === "number") {
      updatePayload.amount = parsed.data.amount;
    }

    const { error } = await supabase
      .from("quotations")
      .update(updatePayload)
      .eq("id", parsed.id);

    if (error) throw new Error(error.message);

    const { data: order, error: orderFetchError } = await supabase
      .from("orders")
      .select("id")
      .eq("quotation_id", parsed.id)
      .maybeSingle();

    if (orderFetchError) throw new Error(orderFetchError.message);

    if (order) {
      const orderPayload: Record<string, unknown> = {
        couple_name: parsed.data.couple_name,
        your_name: parsed.data.your_name,
        contact_number: parsed.data.contact_number,
        email: parsed.data.email || null,
        event_location: parsed.data.event_location,
        wedding_date: parsed.data.wedding_date,
        wedding_venue: parsed.data.wedding_venue || null,
        budget_range: parsed.data.budget_range,
      };

      if (parsed.data.status) {
        orderPayload.status = parsed.data.status === "cancelled" ? "cancelled" : "pending";
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
    revalidatePath(`/quotations/${parsed.id}`);
  });
}
