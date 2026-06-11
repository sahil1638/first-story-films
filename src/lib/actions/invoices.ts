"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { InvoiceType } from "@/types/database";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import { createInvoiceSchema } from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";

export async function createInvoice(
  orderId: string,
  invoiceType: InvoiceType,
  amount: number
) {
  return withSafeError(async () => {
    const parsed = createInvoiceSchema.parse({ orderId, invoiceType, amount });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const prefix = parsed.invoiceType === "gst" ? "INV-GST" : "INV";
    const invoiceNumber = `${prefix}-${Date.now()}`;

    const { error } = await supabase.from("invoices").insert({
      order_id: parsed.orderId,
      invoice_type: parsed.invoiceType,
      invoice_number: invoiceNumber,
      amount: parsed.amount,
      created_by: user?.id ?? null,
    });

    if (error) throw new Error(error.message);
    revalidatePath(`/orders/${parsed.orderId}`);
    return invoiceNumber;
  });
}
