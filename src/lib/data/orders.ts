import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow, requireRoleOrThrow } from "@/lib/auth/require-role";
import { computePaymentStatus } from "@/lib/utils";
import type { Order, InvoiceType } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  payment?: string;
  bill?: string;
  budget?: string;
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

export async function getOrders(filters: OrderFilters = {}): Promise<{ orders: Order[]; count: number }> {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = sanitizePostgrestSearch(filters.search);

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("*", { count: "exact" });

  if (search) {
    query = query.or(
      `your_name.ilike.%${search}%,couple_name.ilike.%${search}%,contact_number.ilike.%${search}%,email.ilike.%${search}%,event_location.ilike.%${search}%`
    );
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.payment && filters.payment !== "all") {
    query = query.eq("payment_status", filters.payment);
  }
  if (filters.bill && filters.bill !== "all") {
    query = query.eq("invoice_type", filters.bill);
  }
  if (filters.budget && filters.budget !== "all") {
    query = query.eq("budget_range", filters.budget);
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
    throw new Error(error.message || "Failed to fetch orders");
  }
  return {
    orders: (data ?? []) as Order[],
    count: count ?? 0,
  };
}

export async function getOrdersSummaryForCustomers() {
  await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, your_name, contact_number, email, total_amount, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch orders summary");
  }
  return data ?? [];
}

export async function getOrderById(id: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_services(*, order_service_allocations(crew_member_id)), order_deliverables(deliverable_id)")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to fetch order");
  }
  return data;
}

export async function getProductionJobsByOrderId(orderId: string) {
  await requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_jobs")
    .select("*, agencies(company_name, person_name, contact_number)")
    .eq("order_id", orderId);

  if (error) {
    throw new Error(error.message || "Failed to fetch production jobs");
  }
  return data ?? [];
}

export async function getPaymentsByOrderId(orderId: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .order("payment_date", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch payments");
  }
  return data ?? [];
}

export async function syncOrderPaymentTotals(supabase: SupabaseClient, orderId: string) {
  const [{ data: order }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("total_amount").eq("id", orderId).single(),
    supabase.from("payments").select("amount").eq("order_id", orderId),
  ]);

  if (!order) throw new Error("Order not found");

  const paidAmount = ((payments ?? []) as { amount: number | string }[]).reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );
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
  }
}

export async function updateOrderAgreementContent(orderId: string, agreementContent: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ agreement_content: agreementContent.trim() || null })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

export async function allocateCrew(
  orderId: string,
  orderServiceId: string,
  crewMemberIds: string[]
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_order_service_allocations", {
    p_order_id: orderId,
    p_order_service_id: orderServiceId,
    p_crew_member_ids: Array.from(new Set(crewMemberIds.filter(Boolean))),
  });
  if (error) throw new Error(error.message);
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
}

export async function updateProductionJobStatus(
  jobId: string,
  status: string,
  _orderId: string
) {
  void _orderId;
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("production_jobs")
    .update({ status })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
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
}

export async function deleteProductionJob(jobId: string, orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_production_job", {
    job_id: jobId,
    order_id: orderId,
  });

  if (error) throw new Error(error.message);
}

export async function deleteOrder(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_order_cascade", { order_id: id });
  if (error) throw new Error(error.message);
}

export async function updateOrderBasic(
  id: string,
  data: {
    couple_name: string;
    contact_number: string;
    email?: string;
    event_location: string;
    wedding_date: string;
    wedding_venue?: string;
    budget_range: string;
    subtotal_amount: number;
    gst_rate: number;
    gst_amount: number;
    total_amount: number;
    invoice_type: InvoiceType;
    status?: string;
  }
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

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
    invoice_type: data.invoice_type,
    subtotal_amount: data.subtotal_amount,
    gst_rate: data.gst_rate,
    gst_amount: data.gst_amount,
    total_amount: data.total_amount,
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
  }

  await syncOrderPaymentTotals(supabase, id);
}

export async function updateOrderAdminNotes(id: string, notes: string | null) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ admin_notes: notes })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
