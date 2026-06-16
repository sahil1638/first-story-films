"use server";

import { revalidatePath } from "next/cache";
import type { InvoiceType } from "@/types/database";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import { createInvoiceSchema } from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";
import { createInvoice as dalCreateInvoice } from "@/lib/data/invoices";

export async function createInvoice(
  orderId: string,
  invoiceType: InvoiceType,
  amount: number
) {
  return withSafeError(async () => {
    const parsed = createInvoiceSchema.parse({ orderId, invoiceType, amount });
    await requireManagerOrAdminOrThrow();

    const invoiceNumber = await dalCreateInvoice(
      parsed.orderId,
      parsed.invoiceType,
      parsed.amount
    );

    revalidatePath(`/orders/${parsed.orderId}`);
    return invoiceNumber;
  });
}
