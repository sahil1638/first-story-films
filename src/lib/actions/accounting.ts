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

    // Execute transactional cascade update RPC, returning affected metadata
    const { data, error: updateError } = await supabase.rpc("update_accounting_entry_cascade", {
      entry_id: parsed.id,
      new_amount: parsed.updates.amount !== undefined ? parsed.updates.amount : null,
      new_entry_date: parsed.updates.entry_date !== undefined ? parsed.updates.entry_date : null,
      new_remarks: parsed.updates.remarks !== undefined ? parsed.updates.remarks : null,
    });
    if (updateError) throw new Error(updateError.message);

    // The RPC returns a single row in an array: { out_order_id, out_source, out_source_id }
    const row = (data as any)?.[0];
    const orderId = row?.out_order_id;
    const source = row?.out_source;

    // Trigger cache revalidation
    if (source === "order_payment" && orderId) {
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderId}`);
    } else if (source === "production_job" && orderId) {
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderId}`);
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

    // Call the cascade delete RPC, returning affected metadata
    const { data, error: deleteError } = await supabase.rpc("delete_accounting_entry_cascade", {
      entry_id: parsedId,
    });
    if (deleteError) throw new Error(deleteError.message);

    const row = (data as any)?.[0];
    const orderId = row?.out_order_id;
    const source = row?.out_source;

    // Trigger cache revalidation
    if (source === "order_payment" && orderId) {
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderId}`);
    } else if (source === "production_job" && orderId) {
      revalidatePath(`/orders/${orderId}`);
    }

    revalidatePath("/accounting");
    return { success: true };
  });
}
