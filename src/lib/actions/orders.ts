"use server";

import { createClient } from "@/lib/supabase/server";
import { GST_RATE_PERCENT, calculateOrderBilling, computePaymentStatus, formatCurrency } from "@/lib/utils";
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

async function getOrCreateAccountingAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string
) {
  const { data: existing } = await supabase
    .from("accounting_accounts")
    .select("id")
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("accounting_accounts")
    .insert({ name, opening_balance: 0, status: "active" })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? `Failed to create ${name} account`);
  return data.id as string;
}

async function getOrCreateAccountingCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  type: "income" | "expense"
) {
  const { data: existing } = await supabase
    .from("accounting_categories")
    .select("id")
    .eq("name", name)
    .eq("type", type)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("accounting_categories")
    .insert({ name, type, status: "active" })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? `Failed to create ${name} category`);
  return data.id as string;
}

async function upsertOrderAccountingEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: {
    source: "order_payment" | "production_job";
    sourceId: string;
    type: "income" | "expense";
    categoryName: string;
    amount: number;
    entryDate: string;
    remarks: string;
    createdBy?: string | null;
  }
) {
  const accountId = await getOrCreateAccountingAccount(supabase, "Order Transactions");
  const categoryId = await getOrCreateAccountingCategory(supabase, payload.categoryName, payload.type);

  await supabase
    .from("accounting_entries")
    .delete()
    .eq("source", payload.source)
    .eq("source_id", payload.sourceId);

  const { error } = await supabase.from("accounting_entries").insert({
    type: payload.type,
    account_id: accountId,
    category_id: categoryId,
    amount: payload.amount,
    entry_date: payload.entryDate,
    remarks: payload.remarks,
    source: payload.source,
    source_id: payload.sourceId,
    created_by: payload.createdBy ?? null,
  });

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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a payment amount greater than zero");
  }
  if (!paymentDate) {
    throw new Error("Select a payment date");
  }

  const supabase = await createClient();
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("total_amount").eq("id", orderId).single(),
    supabase.from("payments").select("amount").eq("order_id", orderId),
  ]);

  if (!order) {
    throw new Error("Order not found");
  }

  const totalAmount = Number(order.total_amount);
  if (totalAmount <= 0) {
    throw new Error("Set the order total first before adding payments");
  }

  const paidAmount = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remaining = totalAmount - paidAmount;
  if (remaining <= 0) {
    throw new Error("This order is already fully paid.");
  }
  if (amount > remaining) {
    throw new Error(`Payment cannot exceed remaining amount of ${formatCurrency(remaining)}.`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let createdBy: string | null = user?.id ?? null;
  if (createdBy) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", createdBy)
      .maybeSingle();
    if (!profile) createdBy = null;
  }

  const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const { data: payment, error: payError } = await supabase
    .from("payments")
    .insert({
      order_id: orderId,
      amount,
      payment_date: paymentDate,
      receipt_number: receiptNumber,
      notes: notes || null,
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (payError || !payment) throw new Error(payError?.message ?? "Failed to add payment");

  await upsertOrderAccountingEntry(supabase, {
    source: "order_payment",
    sourceId: payment.id,
    type: "income",
    categoryName: "Order Payments",
    amount,
    entryDate: paymentDate,
    remarks: notes?.trim() || "Order payment",
    createdBy,
  });

  await syncOrderPaymentTotals(supabase, orderId);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
  return receiptNumber;
}

export async function deletePayment(paymentId: string, orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId)
    .eq("order_id", orderId);

  if (error) throw new Error(error.message);

  await supabase
    .from("accounting_entries")
    .delete()
    .eq("source", "order_payment")
    .eq("source_id", paymentId);

  await syncOrderPaymentTotals(supabase, orderId);
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
  const [{ data: order }, { data: currentPayment }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("total_amount").eq("id", orderId).single(),
    supabase
      .from("payments")
      .select("id, created_by")
      .eq("id", paymentId)
      .eq("order_id", orderId)
      .single(),
    supabase.from("payments").select("id, amount").eq("order_id", orderId),
  ]);

  if (!order) throw new Error("Order not found");
  if (!currentPayment) throw new Error("Payment not found");

  const totalAmount = Number(order.total_amount);
  const paidExcludingCurrent = (payments ?? [])
    .filter((payment) => payment.id !== paymentId)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  if (paidExcludingCurrent + amount > totalAmount) {
    throw new Error(`Payment cannot exceed remaining amount of ${formatCurrency(totalAmount - paidExcludingCurrent)}.`);
  }

  const { error } = await supabase
    .from("payments")
    .update({
      amount,
      payment_date: paymentDate,
      notes: notes?.trim() || null,
    })
    .eq("id", paymentId)
    .eq("order_id", orderId);

  if (error) throw new Error(error.message);

  await upsertOrderAccountingEntry(supabase, {
    source: "order_payment",
    sourceId: paymentId,
    type: "income",
    categoryName: "Order Payments",
    amount,
    entryDate: paymentDate,
    remarks: notes?.trim() || "Order payment",
    createdBy: currentPayment.created_by ?? null,
  });

  await syncOrderPaymentTotals(supabase, orderId);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: job, error } = await supabase
    .from("production_jobs")
    .insert({
      order_id: orderId,
      agency_id: agencyId,
      service_id: serviceId,
      payable_amount: payableAmount,
      created_by: user?.id ?? null,
    })
    .select("id, created_at")
    .single();

  if (error || !job) throw new Error(error?.message ?? "Failed to add production job");

  await upsertOrderAccountingEntry(supabase, {
    source: "production_job",
    sourceId: job.id,
    type: "expense",
    categoryName: "Production Expenses",
    amount: payableAmount,
    entryDate: String(job.created_at).slice(0, 10),
    remarks: "Production expense",
    createdBy: user?.id ?? null,
  });

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
  const { data: currentJob } = await supabase
    .from("production_jobs")
    .select("id, created_at, created_by")
    .eq("id", jobId)
    .eq("order_id", orderId)
    .single();

  if (!currentJob) throw new Error("Production job not found");

  const { error } = await supabase
    .from("production_jobs")
    .update({
      agency_id: agencyId,
      service_id: serviceId,
      payable_amount: payableAmount,
      status,
    })
    .eq("id", jobId)
    .eq("order_id", orderId);

  if (error) throw new Error(error.message);

  await upsertOrderAccountingEntry(supabase, {
    source: "production_job",
    sourceId: jobId,
    type: "expense",
    categoryName: "Production Expenses",
    amount: payableAmount,
    entryDate: String(currentJob.created_at).slice(0, 10),
    remarks: "Production expense",
    createdBy: currentJob.created_by ?? null,
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/accounting");
}

export async function deleteProductionJob(jobId: string, orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  const { error } = await supabase
    .from("production_jobs")
    .delete()
    .eq("id", jobId)
    .eq("order_id", orderId);

  if (error) throw new Error(error.message);

  await supabase
    .from("accounting_entries")
    .delete()
    .eq("source", "production_job")
    .eq("source_id", jobId);

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
