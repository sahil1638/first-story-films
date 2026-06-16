"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
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
import {
  updateQuotationDeliverables as dalUpdateQuotationDeliverables,
  updateQuotationServicePersons as dalUpdateQuotationServicePersons,
  updateQuotationDeliverableSelection as dalUpdateQuotationDeliverableSelection,
  updateQuotationTerms as dalUpdateQuotationTerms,
  updateQuotationStatus as dalUpdateQuotationStatus,
  convertQuotationToOrder as dalConvertQuotationToOrder,
  deleteQuotation as dalDeleteQuotation,
  updateQuotationBasic as dalUpdateQuotationBasic,
} from "@/lib/data/quotations";

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

    await dalUpdateQuotationDeliverables(
      parsed.quotationId,
      parsed.deliverableIds,
      parsed.servicePersons
    );

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

    await dalUpdateQuotationServicePersons(parsed.quotationId, parsed.servicePersons);

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

    await dalUpdateQuotationDeliverableSelection(parsed.quotationId, parsed.deliverableIds);

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

    await dalUpdateQuotationTerms(parsed.quotationId, parsed.terms);

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

    await dalUpdateQuotationStatus(parsed.id, parsed.status);

    revalidatePath("/orders");
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

    const orderId = await dalConvertQuotationToOrder(
      parsed.quotationId,
      parsed.subtotalAmount,
      parsed.invoiceType,
      parsed.servicePersons,
      parsed.deliverableIds
    );

    revalidatePath("/quotations");
    revalidatePath("/orders");
    return orderId;
  });
}

export async function deleteQuotation(id: string) {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");

    await dalDeleteQuotation(parsedId);

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

    await dalUpdateQuotationBasic(parsed.id, parsed.data);

    revalidatePath("/orders");
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${parsed.id}`);
  });
}
