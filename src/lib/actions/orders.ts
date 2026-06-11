"use server";

import { createClient } from "@/lib/supabase/server";
import { GST_RATE_PERCENT, calculateOrderBilling, computePaymentStatus } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import type { InvoiceType } from "@/types/database";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

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
  await requireManagerOrAdminOrThrow();
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new Error("Enter a valid order total");
  }

  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("paid_amount")
    .eq("id", orderId)
    .single();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Order not found");

  const paidAmount = Number(order.paid_amount || 0);
  if (totalAmount < paidAmount) {
    throw new Error("Order total cannot be less than the amount already paid.");
  }

  const { error } = await supabase
    .from("orders")
    .update({ total_amount: totalAmount })
    .eq("id", orderId);

  if (error) throw new Error(error.message);

  await syncOrderPaymentTotals(supabase, orderId);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderStatus(id: string, status: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("quotation_id")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  if (order?.quotation_id) {
    const quotationStatus = status === "cancelled" ? "cancelled" : "convert_to_order";
    const { error: quoteError } = await supabase
      .from("quotations")
      .update({ status: quotationStatus })
      .eq("id", order.quotation_id);

    if (quoteError) throw new Error(quoteError.message);
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${order.quotation_id}`);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}

export async function updateOrderAgreementContent(orderId: string, agreementContent: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ agreement_content: agreementContent.trim() || null })
    .eq("id", orderId);

  if (error) throw new Error(error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/agreement`);
}

export async function allocateCrew(
  orderId: string,
  orderServiceId: string,
  crewMemberIds: string[]
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  await supabase
    .from("order_service_allocations")
    .delete()
    .eq("order_service_id", orderServiceId);

  if (crewMemberIds.length > 0) {
    const { error } = await supabase.from("order_service_allocations").insert(
      crewMemberIds.map((crew_member_id) => ({
        order_service_id: orderServiceId,
        crew_member_id,
      }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function addPayment(
  orderId: string,
  amount: number,
  paymentDate: string,
  notes?: string
) {
  await requireManagerOrAdminOrThrow();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a payment amount greater than zero");
  }
  if (!paymentDate) {
    throw new Error("Select a payment date");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: receiptNumber, error } = await supabase.rpc("add_order_payment", {
    order_id: orderId,
    amount,
    payment_date: paymentDate,
    notes: notes || null,
    created_by_user: user?.id ?? null,
  });

  if (error) throw new Error(error.message || "Failed to add payment");

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
  return receiptNumber as string;
}

export async function deletePayment(paymentId: string, orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_order_payment", {
    payment_id: paymentId,
    order_id: orderId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function updatePayment(
  paymentId: string,
  orderId: string,
  amount: number,
  paymentDate: string,
  notes?: string
) {
  await requireManagerOrAdminOrThrow();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a payment amount greater than zero");
  }
  if (!paymentDate) {
    throw new Error("Select a payment date");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order_payment", {
    payment_id: paymentId,
    order_id: orderId,
    amount,
    payment_date: paymentDate,
    notes: notes?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function addProductionJob(
  orderId: string,
  agencyId: string,
  serviceId: string,
  payableAmount: number
) {
  await requireManagerOrAdminOrThrow();
  if (!agencyId || !serviceId) {
    throw new Error("Select agency and service");
  }
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
    throw new Error("Enter a valid payable amount");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.rpc("add_production_job", {
    order_id: orderId,
    agency_id: agencyId,
    service_id: serviceId,
    payable_amount: payableAmount,
    created_by_user: user?.id ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function updateProductionJobStatus(
  jobId: string,
  status: string,
  orderId: string
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_jobs")
    .update({ status })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
}

export async function updateProductionJob(
  jobId: string,
  orderId: string,
  agencyId: string,
  serviceId: string,
  payableAmount: number,
  status: string
) {
  await requireManagerOrAdminOrThrow();
  if (!agencyId || !serviceId) {
    throw new Error("Select agency and service");
  }
  if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
    throw new Error("Enter a valid payable amount");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_production_job", {
    job_id: jobId,
    order_id: orderId,
    agency_id: agencyId,
    service_id: serviceId,
    payable_amount: payableAmount,
    status: status,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function deleteProductionJob(jobId: string, orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_production_job", {
    job_id: jobId,
    order_id: orderId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function deleteOrder(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  // 1. Fetch payments associated with the order
  const { data: payments } = await supabase
    .from("payments")
    .select("id")
    .eq("order_id", id);

  // 2. Fetch production jobs associated with the order
  const { data: jobs } = await supabase
    .from("production_jobs")
    .select("id")
    .eq("order_id", id);

  // 3. Delete matching accounting entries
  if (payments && payments.length > 0) {
    const paymentIds = payments.map((p) => p.id);
    await supabase
      .from("accounting_entries")
      .delete()
      .eq("source", "order_payment")
      .in("source_id", paymentIds);
  }

  if (jobs && jobs.length > 0) {
    const jobIds = jobs.map((j) => j.id);
    await supabase
      .from("accounting_entries")
      .delete()
      .eq("source", "production_job")
      .in("source_id", jobIds);
  }

  // Nullify customer_id reference on the order to break circular dependency
  await supabase.from("orders").update({ customer_id: null }).eq("id", id);

  // Delete the customer record associated with this order
  await supabase.from("customers").delete().eq("order_id", id);

  // Now delete the order itself
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/orders");
  revalidatePath("/accounting");
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
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const invoiceType = data.invoice_type ?? "non_gst";
  if (!["gst", "non_gst"].includes(invoiceType)) {
    throw new Error("Select a valid invoice type");
  }
  const billing = calculateOrderBilling(data.total_amount, invoiceType);

  const { data: orderData, error: fetchError } = await supabase
    .from("orders")
    .select("quotation_id")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const updatePayload: Record<string, unknown> = {
    couple_name: data.couple_name,
    contact_number: data.contact_number,
    email: data.email || null,
    event_location: data.event_location,
    wedding_date: data.wedding_date,
    wedding_venue: data.wedding_venue || null,
    budget_range: data.budget_range,
    invoice_type: invoiceType,
    subtotal_amount: billing.baseAmount,
    gst_rate: invoiceType === "gst" ? GST_RATE_PERCENT : 0,
    gst_amount: billing.gstAmount,
    total_amount: billing.totalAmount,
  };

  if (data.status) {
    updatePayload.status = data.status;
  }

  const { error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (orderData?.quotation_id) {
    const quotationPayload: Record<string, unknown> = {
      couple_name: data.couple_name,
      contact_number: data.contact_number,
      email: data.email || null,
      event_location: data.event_location,
      wedding_date: data.wedding_date,
      wedding_venue: data.wedding_venue || null,
      budget_range: data.budget_range,
    };

    if (data.status) {
      quotationPayload.status = data.status === "cancelled" ? "cancelled" : "convert_to_order";
    }

    const { error: quoteError } = await supabase
      .from("quotations")
      .update(quotationPayload)
      .eq("id", orderData.quotation_id);

    if (quoteError) throw new Error(quoteError.message);
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${orderData.quotation_id}`);
  }

  await syncOrderPaymentTotals(supabase, id);

  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
}
