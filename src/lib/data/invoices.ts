import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { InvoiceType } from "@/types/database";

export async function getInvoicesByOrderId(orderId: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("order_id", orderId);

  if (error) {
    throw new Error(error.message || "Failed to fetch invoices");
  }
  return data ?? [];
}

export async function createInvoice(
  orderId: string,
  invoiceType: InvoiceType,
  amount: number
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const { data: invoiceNumber, error: rpcError } = await supabase.rpc("create_order_invoice", {
    p_order_id: orderId,
    p_invoice_type: invoiceType,
    p_amount: amount,
    p_invoice_date: today,
    p_created_by: user?.id ?? null,
  });

  if (rpcError || !invoiceNumber) {
    throw new Error(rpcError?.message || "Failed to create invoice");
  }
  return invoiceNumber;
}
