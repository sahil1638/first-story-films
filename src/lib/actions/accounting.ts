"use server";

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
  createCategory,
  updateCategory as dataUpdateCategory,
  deleteCategory as dataDeleteCategory,
  createAccount,
  updateAccount as dataUpdateAccount,
  deleteAccount as dataDeleteAccount,
  createEntry,
  updateEntry as dataUpdateEntry,
  deleteEntry as dataDeleteEntry,
} from "@/lib/data/accounting";

// ============ CATEGORIES ============

export async function addCategory(
  name: string,
  type: "income" | "expense",
  status: string = "active"
): Promise<{ success: boolean; error?: string; data?: AccountingCategory }> {
  return withSafeError(async () => {
    const parsed = addCategorySchema.parse({ name, type, status });
    await requireManagerOrAdminOrThrow();

    const result = await createCategory({
      name: parsed.name,
      type: parsed.type,
      status: parsed.status,
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

    const result = await dataUpdateCategory(parsed.id, parsed.updates);
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

    const result = await dataDeleteCategory(parsedId);
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

    const result = await createAccount({
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

    const result = await dataUpdateAccount(parsed.id, parsed.updates);
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

    const result = await dataDeleteAccount(parsedId);
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

    const result = await createEntry({
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

    const result = await dataUpdateEntry(parsed.id, {
      amount: parsed.updates.amount,
      entryDate: parsed.updates.entry_date,
      remarks: parsed.updates.remarks,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to update accounting entry");
    }

    const row = result.data;
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

    const result = await dataDeleteEntry(parsedId);
    if (!result.success) {
      throw new Error(result.error || "Failed to delete accounting entry");
    }

    const row = result.data;
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
