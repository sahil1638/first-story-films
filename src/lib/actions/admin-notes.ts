"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { updateAdminNotesSchema } from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";
import { updateLeadAdminNotes } from "@/lib/data/leads";
import { updateQuotationAdminNotes } from "@/lib/data/quotations";
import { updateOrderAdminNotes } from "@/lib/data/orders";

export async function updateAdminNotes(
  table: "leads" | "quotations" | "orders",
  recordId: string,
  notes: string | null
) {
  return withSafeError(async () => {
    const parsed = updateAdminNotesSchema.parse({ table, recordId, notes });
    await requireRoleOrThrow(["admin", "manager", "sales"], "Sales access required");

    if (parsed.table === "leads") {
      await updateLeadAdminNotes(parsed.recordId, parsed.notes ?? null);
    } else if (parsed.table === "quotations") {
      await updateQuotationAdminNotes(parsed.recordId, parsed.notes ?? null);
    } else {
      await updateOrderAdminNotes(parsed.recordId, parsed.notes ?? null);
    }

    revalidatePath(`/${parsed.table}`);
    revalidatePath(`/${parsed.table}/${parsed.recordId}`);
  });
}
