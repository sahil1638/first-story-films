"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { AccountingEntry, AccountingAccount, AccountingCategory } from "@/types/database";

// ============ CATEGORIES ============

export async function addCategory(
  name: string,
  type: "income" | "expense",
  status: string = "active"
): Promise<{ success: boolean; error?: string; data?: AccountingCategory }> {
  await requireManagerOrAdminOrThrow();
  if (!name.trim()) return { success: false, error: "Category name required" };
  if (!["income", "expense"].includes(type)) return { success: false, error: "Invalid type" };
  if (!["active", "inactive"].includes(status)) return { success: false, error: "Invalid status" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("accounting_categories")
    .insert([{ name, type, status, created_by: user.id }])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true, data };
}

export async function updateCategory(
  id: string,
  updates: { name?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounting_categories")
    .update(updates)
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  // Check if category is linked to entries
  const { count } = await supabase
    .from("accounting_entries")
    .select("*", { count: "exact" })
    .eq("category_id", id);

  if (count && count > 0) {
    return { success: false, error: "Cannot delete category linked to entries" };
  }

  const { error } = await supabase.from("accounting_categories").delete().eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true };
}

// ============ ACCOUNTS ============

export async function addAccount(
  name: string,
  openingBalance: number
): Promise<{ success: boolean; error?: string; data?: AccountingAccount }> {
  await requireManagerOrAdminOrThrow();
  if (!name.trim()) return { success: false, error: "Account name required" };
  if (openingBalance < 0) return { success: false, error: "Opening balance cannot be negative" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("accounting_accounts")
    .insert([{ name, opening_balance: openingBalance, created_by: user.id }])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true, data };
}

export async function updateAccount(
  id: string,
  updates: { name?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounting_accounts")
    .update(updates)
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true };
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  // Check if account has entries
  const { count } = await supabase
    .from("accounting_entries")
    .select("*", { count: "exact" })
    .eq("account_id", id);

  if (count && count > 0) {
    return { success: false, error: "Cannot delete account with existing entries" };
  }

  const { error } = await supabase.from("accounting_accounts").delete().eq("id", id);

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true };
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
  await requireManagerOrAdminOrThrow();
  if (!["income", "expense"].includes(type)) return { success: false, error: "Invalid type" };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  if (!accountId) return { success: false, error: "Account required" };
  if (!categoryId) return { success: false, error: "Category required" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Validate account is active
  const { data: account } = await supabase
    .from("accounting_accounts")
    .select("status")
    .eq("id", accountId)
    .single();

  if (!account || account.status !== "active") {
    return { success: false, error: "Account is inactive or not found" };
  }

  // Validate category is active and matches type
  const { data: category } = await supabase
    .from("accounting_categories")
    .select("type, status")
    .eq("id", categoryId)
    .single();

  if (!category || category.status !== "active") {
    return { success: false, error: "Category is inactive or not found" };
  }

  if (category.type !== type) {
    return { success: false, error: `Category type mismatch: expected ${type}` };
  }

  const { data, error } = await supabase
    .from("accounting_entries")
    .insert([
      {
        type,
        account_id: accountId,
        category_id: categoryId,
        amount,
        entry_date: entryDate,
        remarks,
        created_by: user.id,
      },
    ])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/accounting");
  return { success: true, data };
}

export async function updateEntry(
  id: string,
  updates: Partial<{
    amount: number;
    entry_date: string;
    remarks: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  if (updates.amount !== undefined && updates.amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const supabase = await createClient();
  const { data: existingEntry, error: fetchError } = await supabase
    .from("accounting_entries")
    .select("source, source_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!existingEntry) return { success: false, error: "Entry not found" };

  let orderIdToRevalidate: string | null = null;

  if (existingEntry.source === "order_payment" && existingEntry.source_id) {
    const { data: payment } = await supabase
      .from("payments")
      .select("id, order_id")
      .eq("id", existingEntry.source_id)
      .maybeSingle();

    if (payment?.order_id) {
      orderIdToRevalidate = payment.order_id;

      if (updates.amount !== undefined) {
        const [{ data: order }, { data: payments }] = await Promise.all([
          supabase.from("orders").select("total_amount").eq("id", payment.order_id).single(),
          supabase.from("payments").select("id, amount").eq("order_id", payment.order_id),
        ]);

        const totalAmount = Number(order?.total_amount ?? 0);
        const paidExcludingCurrent = (payments ?? [])
          .filter((row) => row.id !== existingEntry.source_id)
          .reduce((sum, row) => sum + Number(row.amount), 0);

        if (paidExcludingCurrent + updates.amount > totalAmount) {
          return {
            success: false,
            error: `Payment cannot exceed remaining amount of ${totalAmount - paidExcludingCurrent}.`,
          };
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

  const { error } = await supabase.from("accounting_entries").update(updates).eq("id", id);

  if (error) return { success: false, error: error.message };

  if (existingEntry.source === "order_payment" && existingEntry.source_id) {
    const paymentUpdates: Record<string, unknown> = {};
    if (updates.amount !== undefined) paymentUpdates.amount = updates.amount;
    if (updates.entry_date !== undefined) paymentUpdates.payment_date = updates.entry_date;
    if (updates.remarks !== undefined) paymentUpdates.notes = updates.remarks?.trim() || null;

    if (Object.keys(paymentUpdates).length > 0) {
      const { error: paymentError } = await supabase
        .from("payments")
        .update(paymentUpdates)
        .eq("id", existingEntry.source_id);
      if (paymentError) return { success: false, error: paymentError.message };
    }

    if (orderIdToRevalidate) {
      const { syncOrderPaymentTotals } = await import("@/lib/actions/orders");
      await syncOrderPaymentTotals(supabase, orderIdToRevalidate);
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderIdToRevalidate}`);
    }
  } else if (existingEntry.source === "production_job" && existingEntry.source_id) {
    if (updates.amount !== undefined) {
      const { error: jobError } = await supabase
        .from("production_jobs")
        .update({ payable_amount: updates.amount })
        .eq("id", existingEntry.source_id);
      if (jobError) return { success: false, error: jobError.message };
    }

    if (orderIdToRevalidate) {
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderIdToRevalidate}`);
    }
  }

  revalidatePath("/accounting");
  return { success: true };
}

export async function deleteEntry(id: string): Promise<{ success: boolean; error?: string }> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  // 1. Fetch the entry first to see if it is linked to a payment or production job
  const { data: entry, error: fetchError } = await supabase
    .from("accounting_entries")
    .select("source, source_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!entry) return { success: false, error: "Entry not found" };

  let orderIdToRevalidate: string | null = null;

  if (entry.source === "order_payment" && entry.source_id) {
    // Find the associated payment and get the order_id
    const { data: payment } = await supabase
      .from("payments")
      .select("order_id")
      .eq("id", entry.source_id)
      .maybeSingle();

    if (payment?.order_id) {
      orderIdToRevalidate = payment.order_id;
      // Delete the payment record
      await supabase.from("payments").delete().eq("id", entry.source_id);
    }
  } else if (entry.source === "production_job" && entry.source_id) {
    // Find the associated job and get the order_id
    const { data: job } = await supabase
      .from("production_jobs")
      .select("order_id")
      .eq("id", entry.source_id)
      .maybeSingle();

    if (job?.order_id) {
      orderIdToRevalidate = job.order_id;
      // Delete the production job
      await supabase.from("production_jobs").delete().eq("id", entry.source_id);
    }
  }

  // 2. Delete the accounting entry itself
  const { error: deleteError } = await supabase
    .from("accounting_entries")
    .delete()
    .eq("id", id);

  if (deleteError) return { success: false, error: deleteError.message };

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
}
