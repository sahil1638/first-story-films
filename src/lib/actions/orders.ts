"use server";

import { createClient } from "@/lib/supabase/server";
import { GST_RATE_PERCENT, calculateOrderBilling, computePaymentStatus } from "@/lib/utils";
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

export async function syncOrderPaymentTotals(supabase: Awaited<ReturnType<typeof createClient>>, orderId: string) {
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("total_amount").eq("id", orderId).single(),
    supabase.from("payments").select("amount").eq("order_id", orderId),
  ]);

  if (!order) throw new Error("Order not found");

  const paidAmount = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const totalAmount = Number(order.total_amount);
  const payment_status = computePaymentStatus(totalAmount, paidAmount);

  const { error } = await supabase
    .from("orders")
    .update({ paid_amount: paidAmount, payment_status })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

export async function updateOrderTotal(orderId: string, totalAmount: number) {
  return withSafeError(async () => {
    const parsed = updateOrderTotalSchema.parse({ orderId, totalAmount });
    await requireManagerOrAdminOrThrow();
    if (!Number.isFinite(parsed.totalAmount) || parsed.totalAmount < 0) {
      throw new Error("Enter a valid order total");
    }

    const supabase = await createClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("paid_amount")
      .eq("id", parsed.orderId)
      .single();

    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Order not found");

    const paidAmount = Number(order.paid_amount || 0);
    if (parsed.totalAmount < paidAmount) {
      throw new Error("Order total cannot be less than the amount already paid.");
    }

    const { error } = await supabase
      .from("orders")
      .update({ total_amount: parsed.totalAmount })
      .eq("id", parsed.orderId);

    if (error) throw new Error(error.message);

    await syncOrderPaymentTotals(supabase, parsed.orderId);
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
  });
}

export async function updateOrderStatus(id: string, status: string) {
  return withSafeError(async () => {
    const parsed = updateOrderStatusSchema.parse({ id, status });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("quotation_id")
      .eq("id", parsed.id)
      .single();

    if (fetchError) throw new Error(fetchError.message);

    const { error } = await supabase.from("orders").update({ status: parsed.status }).eq("id", parsed.id);
    if (error) throw new Error(error.message);

    if (order?.quotation_id) {
      const quotationStatus = parsed.status === "cancelled" ? "cancelled" : "convert_to_order";
      const { error: quoteError } = await supabase
        .from("quotations")
        .update({ status: quotationStatus })
        .eq("id", order.quotation_id);

      if (quoteError) throw new Error(quoteError.message);
      revalidatePath("/quotations");
      revalidatePath(`/quotations/${order.quotation_id}`);
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.id}`);
  });
}

export async function updateOrderAgreementContent(orderId: string, agreementContent: string) {
  return withSafeError(async () => {
    const parsed = updateOrderAgreementContentSchema.parse({ orderId, agreementContent });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update({ agreement_content: parsed.agreementContent.trim() || null })
      .eq("id", parsed.orderId);

    if (error) throw new Error(error.message);

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
    const supabase = await createClient();
    await supabase
      .from("order_service_allocations")
      .delete()
      .eq("order_service_id", parsed.orderServiceId);

    if (parsed.crewMemberIds.length > 0) {
      const { error } = await supabase.from("order_service_allocations").insert(
        parsed.crewMemberIds.map((crew_member_id) => ({
          order_service_id: parsed.orderServiceId,
          crew_member_id,
        }))
      );
      if (error) throw new Error(error.message);
    }

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
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      throw new Error("Enter a payment amount greater than zero");
    }
    if (!parsed.paymentDate) {
      throw new Error("Select a payment date");
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: receiptNumber, error } = await supabase.rpc("add_order_payment", {
      order_id: parsed.orderId,
      amount: parsed.amount,
      payment_date: parsed.paymentDate,
      notes: parsed.notes || null,
      created_by_user: user?.id ?? null,
    });

    if (error) throw new Error(error.message || "Failed to add payment");

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
    return receiptNumber as string;
  });
}

export async function deletePayment(paymentId: string, orderId: string) {
  return withSafeError(async () => {
    const parsed = deletePaymentSchema.parse({ paymentId, orderId });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_order_payment", {
      payment_id: parsed.paymentId,
      order_id: parsed.orderId,
    });

    if (error) throw new Error(error.message);

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
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      throw new Error("Enter a payment amount greater than zero");
    }
    if (!parsed.paymentDate) {
      throw new Error("Select a payment date");
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_order_payment", {
      payment_id: parsed.paymentId,
      order_id: parsed.orderId,
      amount: parsed.amount,
      payment_date: parsed.paymentDate,
      notes: parsed.notes?.trim() || null,
    });

    if (error) throw new Error(error.message);

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
    if (!parsed.agencyId || !parsed.serviceId) {
      throw new Error("Select agency and service");
    }
    if (!Number.isFinite(parsed.payableAmount) || parsed.payableAmount <= 0) {
      throw new Error("Enter a valid payable amount");
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("add_production_job", {
      order_id: parsed.orderId,
      agency_id: parsed.agencyId,
      service_id: parsed.serviceId,
      payable_amount: parsed.payableAmount,
      created_by_user: user?.id ?? null,
    });

    if (error) throw new Error(error.message);

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
    const supabase = await createClient();
    const { error } = await supabase
      .from("production_jobs")
      .update({ status: parsed.status })
      .eq("id", parsed.jobId);
    if (error) throw new Error(error.message);
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
    if (!parsed.agencyId || !parsed.serviceId) {
      throw new Error("Select agency and service");
    }
    if (!Number.isFinite(parsed.payableAmount) || parsed.payableAmount <= 0) {
      throw new Error("Enter a valid payable amount");
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_production_job", {
      job_id: parsed.jobId,
      order_id: parsed.orderId,
      agency_id: parsed.agencyId,
      service_id: parsed.serviceId,
      payable_amount: parsed.payableAmount,
      status: parsed.status,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function deleteProductionJob(jobId: string, orderId: string) {
  return withSafeError(async () => {
    const parsed = deleteProductionJobSchema.parse({ jobId, orderId });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    const { error } = await supabase.rpc("delete_production_job", {
      job_id: parsed.jobId,
      order_id: parsed.orderId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/orders/${parsed.orderId}`);
    revalidatePath("/accounting");
  });
}

export async function deleteOrder(id: string) {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    const { error } = await supabase.rpc("delete_order_cascade", { order_id: parsedId });
    if (error) throw new Error(error.message);

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
    const supabase = await createClient();
    const invoiceType = parsed.data.invoice_type ?? "non_gst";
    if (!["gst", "non_gst"].includes(invoiceType)) {
      throw new Error("Select a valid invoice type");
    }
    const billing = calculateOrderBilling(parsed.data.total_amount, invoiceType);

    const { data: orderData, error: fetchError } = await supabase
      .from("orders")
      .select("quotation_id")
      .eq("id", parsed.id)
      .single();

    if (fetchError) throw new Error(fetchError.message);

    const updatePayload: Record<string, unknown> = {
      couple_name: parsed.data.couple_name,
      contact_number: parsed.data.contact_number,
      email: parsed.data.email || null,
      event_location: parsed.data.event_location,
      wedding_date: parsed.data.wedding_date,
      wedding_venue: parsed.data.wedding_venue || null,
      budget_range: parsed.data.budget_range,
      invoice_type: invoiceType,
      subtotal_amount: billing.baseAmount,
      gst_rate: invoiceType === "gst" ? GST_RATE_PERCENT : 0,
      gst_amount: billing.gstAmount,
      total_amount: billing.totalAmount,
    };

    if (parsed.data.status) {
      updatePayload.status = parsed.data.status;
    }

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", parsed.id);

    if (error) throw new Error(error.message);

    if (orderData?.quotation_id) {
      const quotationPayload: Record<string, unknown> = {
        couple_name: parsed.data.couple_name,
        contact_number: parsed.data.contact_number,
        email: parsed.data.email || null,
        event_location: parsed.data.event_location,
        wedding_date: parsed.data.wedding_date,
        wedding_venue: parsed.data.wedding_venue || null,
        budget_range: parsed.data.budget_range,
      };

      if (parsed.data.status) {
        quotationPayload.status = parsed.data.status === "cancelled" ? "cancelled" : "convert_to_order";
      }

      const { error: quoteError } = await supabase
        .from("quotations")
        .update(quotationPayload)
        .eq("id", orderData.quotation_id);

      if (quoteError) throw new Error(quoteError.message);
      revalidatePath("/quotations");
      revalidatePath(`/quotations/${orderData.quotation_id}`);
    }

    await syncOrderPaymentTotals(supabase, parsed.id);

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.id}`);
  });
}
