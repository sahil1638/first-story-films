"use server";

import { GST_RATE_PERCENT, calculateOrderBilling } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import type { InvoiceType } from "@/types/database";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import {
  uuidSchema,
  updateOrderTotalSchema,
  updateOrderStatusSchema,
  updateOrderAgreementContentSchema,
  allocateCrewSchema,
  addPaymentSchema,
  deletePaymentSchema,
  updatePaymentSchema,
  addProductionJobSchema,
  updateProductionJobStatusSchema,
  updateProductionJobSchema,
  deleteProductionJobSchema,
  updateOrderBasicSchema,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";
import {
  updateOrderTotal as dalUpdateOrderTotal,
  updateOrderStatus as dalUpdateOrderStatus,
  updateOrderAgreementContent as dalUpdateOrderAgreementContent,
  allocateCrew as dalAllocateCrew,
  addPayment as dalAddPayment,
  deletePayment as dalDeletePayment,
  updatePayment as dalUpdatePayment,
  addProductionJob as dalAddProductionJob,
  updateProductionJobStatus as dalUpdateProductionJobStatus,
  updateProductionJob as dalUpdateProductionJob,
  deleteProductionJob as dalDeleteProductionJob,
  deleteOrder as dalDeleteOrder,
  updateOrderBasic as dalUpdateOrderBasic,
} from "@/lib/data/orders";

export async function updateOrderTotal(orderId: string, totalAmount: number) {
  return withSafeError(async () => {
    const parsed = updateOrderTotalSchema.parse({ orderId, totalAmount });
    await requireManagerOrAdminOrThrow();

    await dalUpdateOrderTotal(parsed.orderId, parsed.totalAmount);

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
  });
}

export async function updateOrderStatus(id: string, status: string) {
  return withSafeError(async () => {
    const parsed = updateOrderStatusSchema.parse({ id, status });
    await requireManagerOrAdminOrThrow();

    await dalUpdateOrderStatus(parsed.id, parsed.status);

    revalidatePath("/quotations");
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.id}`);
  });
}

export async function updateOrderAgreementContent(orderId: string, agreementContent: string) {
  return withSafeError(async () => {
    const parsed = updateOrderAgreementContentSchema.parse({ orderId, agreementContent });
    await requireManagerOrAdminOrThrow();

    await dalUpdateOrderAgreementContent(parsed.orderId, parsed.agreementContent);

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath(`/orders/${parsed.orderId}/agreement`);
  });
}

export async function allocateCrew(
  orderId: string,
  orderServiceId: string,
  crewMemberIds: string[]
) {
  return withSafeError(async () => {
    const parsed = allocateCrewSchema.parse({ orderId, orderServiceId, crewMemberIds });
    await requireManagerOrAdminOrThrow();

    await dalAllocateCrew(parsed.orderId, parsed.orderServiceId, parsed.crewMemberIds);

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
  });
}

export async function addPayment(
  orderId: string,
  amount: number,
  paymentDate: string,
  notes?: string
) {
  return withSafeError(async () => {
    const parsed = addPaymentSchema.parse({ orderId, amount, paymentDate, notes });
    await requireManagerOrAdminOrThrow();

    const receiptNumber = await dalAddPayment(
      parsed.orderId,
      parsed.amount,
      parsed.paymentDate,
      parsed.notes
    );

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
    return receiptNumber;
  });
}

export async function deletePayment(paymentId: string, orderId: string) {
  return withSafeError(async () => {
    const parsed = deletePaymentSchema.parse({ paymentId, orderId });
    await requireManagerOrAdminOrThrow();

    await dalDeletePayment(parsed.paymentId, parsed.orderId);

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function updatePayment(
  paymentId: string,
  orderId: string,
  amount: number,
  paymentDate: string,
  notes?: string
) {
  return withSafeError(async () => {
    const parsed = updatePaymentSchema.parse({ paymentId, orderId, amount, paymentDate, notes });
    await requireManagerOrAdminOrThrow();

    await dalUpdatePayment(
      parsed.paymentId,
      parsed.orderId,
      parsed.amount,
      parsed.paymentDate,
      parsed.notes
    );

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function addProductionJob(
  orderId: string,
  agencyId: string,
  serviceId: string,
  payableAmount: number
) {
  return withSafeError(async () => {
    const parsed = addProductionJobSchema.parse({ orderId, agencyId, serviceId, payableAmount });
    await requireManagerOrAdminOrThrow();

    await dalAddProductionJob(
      parsed.orderId,
      parsed.agencyId,
      parsed.serviceId,
      parsed.payableAmount
    );

    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function updateProductionJobStatus(
  jobId: string,
  status: string,
  orderId: string
) {
  return withSafeError(async () => {
    const parsed = updateProductionJobStatusSchema.parse({ jobId, status, orderId });
    await requireManagerOrAdminOrThrow();

    await dalUpdateProductionJobStatus(parsed.jobId, parsed.status, parsed.orderId);

    revalidatePath(`/orders/${parsed.orderId}`);
  });
}

export async function updateProductionJob(
  jobId: string,
  orderId: string,
  agencyId: string,
  serviceId: string,
  payableAmount: number,
  status: string
) {
  return withSafeError(async () => {
    const parsed = updateProductionJobSchema.parse({ jobId, orderId, agencyId, serviceId, payableAmount, status });
    await requireManagerOrAdminOrThrow();

    await dalUpdateProductionJob(
      parsed.jobId,
      parsed.orderId,
      parsed.agencyId,
      parsed.serviceId,
      parsed.payableAmount,
      parsed.status
    );

    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function deleteProductionJob(jobId: string, orderId: string) {
  return withSafeError(async () => {
    const parsed = deleteProductionJobSchema.parse({ jobId, orderId });
    await requireManagerOrAdminOrThrow();

    await dalDeleteProductionJob(parsed.jobId, parsed.orderId);

    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function deleteOrder(id: string) {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireManagerOrAdminOrThrow();

    await dalDeleteOrder(parsedId);

    revalidatePath("/orders");
    revalidatePath("/accounting");
  });
}

export async function updateOrderBasic(
  id: string,
  data: {
    couple_name: string;
    contact_number: string;
    email: string;
    event_location: string;
    wedding_date: string;
    wedding_venue?: string;
    budget_range: string;
    total_amount: number;
    invoice_type?: InvoiceType;
    status?: string;
  }
) {
  return withSafeError(async () => {
    const parsed = updateOrderBasicSchema.parse({ id, data });
    await requireManagerOrAdminOrThrow();

    const invoiceType = parsed.data.invoice_type ?? "non_gst";
    if (!["gst", "non_gst"].includes(invoiceType)) {
      throw new Error("Select a valid invoice type");
    }
    const billing = calculateOrderBilling(parsed.data.total_amount, invoiceType);

    await dalUpdateOrderBasic(parsed.id, {
      couple_name: parsed.data.couple_name,
      contact_number: parsed.data.contact_number,
      email: parsed.data.email,
      event_location: parsed.data.event_location,
      wedding_date: parsed.data.wedding_date,
      wedding_venue: parsed.data.wedding_venue,
      budget_range: parsed.data.budget_range,
      subtotal_amount: billing.baseAmount,
      gst_rate: invoiceType === "gst" ? GST_RATE_PERCENT : 0,
      gst_amount: billing.gstAmount,
      total_amount: billing.totalAmount,
      invoice_type: invoiceType,
      status: parsed.data.status,
    });

    revalidatePath("/quotations");
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.id}`);
  });
}
