"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { InvoiceType } from "@/types/database";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

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

  const prefix = invoiceType === "gst" ? "INV-GST" : "INV";
  const invoiceNumber = `${prefix}-${Date.now()}`;

  const { error } = await supabase.from("invoices").insert({
    order_id: orderId,
    invoice_type: invoiceType,
    invoice_number: invoiceNumber,
    amount,
    created_by: user?.id ?? null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/orders/${orderId}`);
  return invoiceNumber;
}
