"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { AccountingEntry, AccountingAccount, AccountingCategory } from "@/types/database";
import {
  uuidSchema,
  addCategorySchema,
  updateCategorySchema,
  addAccountSchema,
  updateAccountSchema,
  addEntrySchema,
  updateEntrySchema,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";
import {
  createCategory as serviceCreateCategory,
  updateCategory as serviceUpdateCategory,
  deleteCategory as serviceDeleteCategory,
  createAccount as serviceCreateAccount,
  updateAccount as serviceUpdateAccount,
  deleteAccount as serviceDeleteAccount,
  createEntry as serviceCreateEntry,
  updateEntry as serviceUpdateEntry,
  deleteEntry as serviceDeleteEntry,
} from "@/lib/services/accounting";

// ============ CATEGORIES ============

export async function addCategory(
  name: string,
  type: "income" | "expense",
  status: string = "active"
): Promise<{ success: boolean; error?: string; data?: AccountingCategory }> {
  return withSafeError(async () => {
    const parsed = addCategorySchema.parse({ name, type, status });
    await requireManagerOrAdminOrThrow();

    const result = await serviceCreateCategory({
      name: parsed.name,
      type: parsed.type,
      status: parsed.status as any,
    });

    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

export async function updateCategory(
  id: string,
  updates: { name?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsed = updateCategorySchema.parse({ id, updates });
    await requireManagerOrAdminOrThrow();

    const result = await serviceUpdateCategory(parsed.id, parsed.updates as any);
    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireManagerOrAdminOrThrow();

    const result = await serviceDeleteCategory(parsedId);
    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

// ============ ACCOUNTS ============

export async function addAccount(
  name: string,
  openingBalance: number
): Promise<{ success: boolean; error?: string; data?: AccountingAccount }> {
  return withSafeError(async () => {
    const parsed = addAccountSchema.parse({ name, openingBalance });
    await requireManagerOrAdminOrThrow();

    const result = await serviceCreateAccount({
      name: parsed.name,
      openingBalance: parsed.openingBalance,
    });

    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

export async function updateAccount(
  id: string,
  updates: { name?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsed = updateAccountSchema.parse({ id, updates });
    await requireManagerOrAdminOrThrow();

    const result = await serviceUpdateAccount(parsed.id, parsed.updates as any);
    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireManagerOrAdminOrThrow();

    const result = await serviceDeleteAccount(parsedId);
    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

// ============ ENTRIES ============

export async function addEntry(
  type: "income" | "expense",
  accountId: string,
  categoryId: string,
  amount: number,
  entryDate: string,
  remarks?: string
): Promise<{ success: boolean; error?: string; data?: AccountingEntry }> {
  return withSafeError(async () => {
    const parsed = addEntrySchema.parse({
      type,
      accountId,
      categoryId,
      amount,
      entryDate,
      remarks,
    });
    await requireManagerOrAdminOrThrow();

    const result = await serviceCreateEntry({
      type: parsed.type,
      accountId: parsed.accountId,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      entryDate: parsed.entryDate,
      remarks: parsed.remarks,
    });

    if (result.success) {
      revalidatePath("/accounting");
    }
    return result;
  });
}

export async function updateEntry(
  id: string,
  updates: Partial<{
    amount: number;
    entry_date: string;
    remarks: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsed = updateEntrySchema.parse({ id, updates });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    const { data: existingEntry, error: fetchError } = await supabase
      .from("accounting_entries")
      .select("source, source_id")
      .eq("id", parsed.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!existingEntry) throw new Error("Entry not found");

    let orderIdToRevalidate: string | null = null;

    if (existingEntry.source === "order_payment" && existingEntry.source_id) {
      const { data: payment } = await supabase
        .from("payments")
        .select("id, order_id")
        .eq("id", existingEntry.source_id)
        .maybeSingle();

      if (payment?.order_id) {
        orderIdToRevalidate = payment.order_id;

        if (parsed.updates.amount !== undefined) {
          const [{ data: order }, { data: payments }] = await Promise.all([
            supabase.from("orders").select("total_amount").eq("id", payment.order_id).single(),
            supabase.from("payments").select("id, amount").eq("order_id", payment.order_id),
          ]);

          const totalAmount = Number(order?.total_amount ?? 0);
          const paidExcludingCurrent = (payments ?? [])
            .filter((row) => row.id !== existingEntry.source_id)
            .reduce((sum, row) => sum + Number(row.amount), 0);

          if (paidExcludingCurrent + parsed.updates.amount > totalAmount) {
            throw new Error(`Payment cannot exceed remaining amount of ${totalAmount - paidExcludingCurrent}.`);
          }
        }
      }
    } else if (existingEntry.source === "production_job" && existingEntry.source_id) {
      const { data: job } = await supabase
        .from("production_jobs")
        .select("order_id")
        .eq("id", existingEntry.source_id)
        .maybeSingle();
      if (job?.order_id) orderIdToRevalidate = job.order_id;
    }

    // Delegate the entry update itself to the service layer
    const serviceRes = await serviceUpdateEntry(parsed.id, {
      amount: parsed.updates.amount,
      entryDate: parsed.updates.entry_date,
      remarks: parsed.updates.remarks,
    });
    if (!serviceRes.success) throw new Error(serviceRes.error || "Failed to update entry");

    if (existingEntry.source === "order_payment" && existingEntry.source_id) {
      const paymentUpdates: Record<string, unknown> = {};
      if (parsed.updates.amount !== undefined) paymentUpdates.amount = parsed.updates.amount;
      if (parsed.updates.entry_date !== undefined) paymentUpdates.payment_date = parsed.updates.entry_date;
      if (parsed.updates.remarks !== undefined) paymentUpdates.notes = parsed.updates.remarks?.trim() || null;

      if (Object.keys(paymentUpdates).length > 0) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update(paymentUpdates)
          .eq("id", existingEntry.source_id);
        if (paymentError) throw new Error(paymentError.message);
      }

      if (orderIdToRevalidate) {
        const { syncOrderPaymentTotals } = await import("@/lib/actions/orders");
        await syncOrderPaymentTotals(supabase, orderIdToRevalidate);
        revalidatePath("/orders");
        revalidatePath(`/orders/${orderIdToRevalidate}`);
      }
    } else if (existingEntry.source === "production_job" && existingEntry.source_id) {
      if (parsed.updates.amount !== undefined) {
        const { error: jobError } = await supabase
          .from("production_jobs")
          .update({ payable_amount: parsed.updates.amount })
          .eq("id", existingEntry.source_id);
        if (jobError) throw new Error(jobError.message);
      }

      if (orderIdToRevalidate) {
        revalidatePath("/orders");
        revalidatePath(`/orders/${orderIdToRevalidate}`);
      }
    }

    revalidatePath("/accounting");
    return { success: true };
  });
}

export async function deleteEntry(id: string): Promise<{ success: boolean; error?: string }> {
  return withSafeError(async () => {
    const parsedId = uuidSchema.parse(id);
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    // 1. Fetch the entry first to see if it is linked to a payment or production job
    const { data: entry, error: fetchError } = await supabase
      .from("accounting_entries")
      .select("source, source_id")
      .eq("id", parsedId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!entry) throw new Error("Entry not found");

    let orderIdToRevalidate: string | null = null;

    if (entry.source === "order_payment" && entry.source_id) {
      const { data: payment } = await supabase
        .from("payments")
        .select("order_id")
        .eq("id", entry.source_id)
        .maybeSingle();

      if (payment?.order_id) {
        orderIdToRevalidate = payment.order_id;
        await supabase.from("payments").delete().eq("id", entry.source_id);
      }
    } else if (entry.source === "production_job" && entry.source_id) {
      const { data: job } = await supabase
        .from("production_jobs")
        .select("order_id")
        .eq("id", entry.source_id)
        .maybeSingle();

      if (job?.order_id) {
        orderIdToRevalidate = job.order_id;
        await supabase.from("production_jobs").delete().eq("id", entry.source_id);
      }
    }

    // 2. Delegate the deletion of the accounting entry itself to the service layer
    const serviceRes = await serviceDeleteEntry(parsedId);
    if (!serviceRes.success) throw new Error(serviceRes.error || "Failed to delete entry");

    // 3. If it was linked to an order payment, sync payment totals and revalidate
    if (entry.source === "order_payment" && orderIdToRevalidate) {
      const { syncOrderPaymentTotals } = await import("@/lib/actions/orders");
      await syncOrderPaymentTotals(supabase, orderIdToRevalidate);
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderIdToRevalidate}`);
    } else if (entry.source === "production_job" && orderIdToRevalidate) {
      revalidatePath(`/orders/${orderIdToRevalidate}`);
    }

    revalidatePath("/accounting");
    return { success: true };
  });
}
