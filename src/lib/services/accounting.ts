"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type {
  AccountingAccount,
  AccountingCategory,
  AccountingEntry,
  RecordStatus,
} from "@/types/database";

export type EntryFilterParams = {
  page?: number;
  limit?: number;
  type?: "income" | "expense" | "both";
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type AccountFilterParams = {
  page?: number;
  limit?: number;
  status?: RecordStatus | "all";
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type CategoryFilterParams = {
  page?: number;
  limit?: number;
  type?: "income" | "expense" | "all";
  status?: RecordStatus | "all";
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

const sanitizeSort = (sortBy: string | undefined, defaultSort: string) => {
  const allowed = [
    "entry_date",
    "amount",
    "type",
    "remarks",
    "name",
    "status",
    "opening_balance",
    "created_at",
    "updated_at",
  ];
  if (sortBy && allowed.includes(sortBy)) return sortBy;
  return defaultSort;
};

function normalizePagination(page = 1, limit = 20) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.max(1, Number(limit) || 20);
  return { page: pageNumber, limit: pageSize, from: (pageNumber - 1) * pageSize, to: pageNumber * pageSize - 1 };
}

function normalizeStatus(status?: RecordStatus | "all") {
  return status === "all" || !status ? null : status;
}

function sanitizeTypeFilter(type?: "income" | "expense" | "both") {
  if (type === "income" || type === "expense") return type;
  return null;
}

function getSummaryValues(entries: Pick<AccountingEntry, "type" | "amount">[]) {
  const totalIncome = entries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalExpense = entries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    net: totalIncome - totalExpense,
    count: entries.length,
  };
}

function buildEntryQuery(filters: EntryFilterParams, query: any) {
  if (filters.type && filters.type !== "both") {
    query = query.eq("type", filters.type);
  }
  if (filters.accountId) {
    query = query.eq("account_id", filters.accountId);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.search) {
    query = query.ilike("remarks", `%${filters.search}%`);
  }
  if (filters.dateFrom) {
    query = query.gte("entry_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("entry_date", filters.dateTo);
  }
  return query;
}

export async function getEntries(filters: EntryFilterParams = {}) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const pagination = normalizePagination(filters.page, filters.limit);

  let query = supabase
    .from("accounting_entries")
    .select(
      "*, accounting_accounts(id,name), accounting_categories(id,name,type)",
      { count: "exact" }
    );

  query = buildEntryQuery(filters, query);

  const orderBy = sanitizeSort(filters.sortBy, "entry_date");
  const ascending = filters.sortOrder === "asc";
  query = query.order(orderBy, { ascending }).range(pagination.from, pagination.to);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const entries = (data ?? []).map((row: any) => ({
    ...row,
    account_name: row.accounting_accounts?.name ?? "",
    category_name: row.accounting_categories?.name ?? "",
    category_type: row.accounting_categories?.type,
  }));

  return { entries, count: count ?? 0, page: pagination.page, limit: pagination.limit };
}

export async function getEntriesSummary(filters: EntryFilterParams = {}) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  let query = supabase.from("accounting_entries").select("type,amount", { count: "exact" });
  query = buildEntryQuery(filters, query);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return getSummaryValues(data ?? []);
}

export async function createEntry(payload: {
  type: "income" | "expense";
  accountId: string;
  categoryId: string;
  amount: number;
  entryDate: string;
  remarks?: string;
}) {
  await requireManagerOrAdminOrThrow();
  const { type, accountId, categoryId, amount, entryDate, remarks } = payload;
  if (!["income", "expense"].includes(type)) return { success: false, error: "Invalid entry type" };
  if (amount <= 0) return { success: false, error: "Amount must be positive" };
  if (!accountId) return { success: false, error: "Account is required" };
  if (!categoryId) return { success: false, error: "Category is required" };
  if (!entryDate) return { success: false, error: "Date is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: account } = await supabase
    .from("accounting_accounts")
    .select("status")
    .eq("id", accountId)
    .single();
  if (!account || account.status !== "active") {
    return { success: false, error: "Account must be active" };
  }

  const { data: category } = await supabase
    .from("accounting_categories")
    .select("type,status")
    .eq("id", categoryId)
    .single();
  if (!category || category.status !== "active") {
    return { success: false, error: "Category must be active" };
  }
  if (category.type !== type) {
    return { success: false, error: "Category does not match entry type" };
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
        remarks: remarks?.trim() || null,
        created_by: user.id,
      },
    ])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getEntryById(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_entries")
    .select("*, accounting_accounts(id,name), accounting_categories(id,name,type)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...data,
    account_name: data.accounting_accounts?.name ?? "",
    category_name: data.accounting_categories?.name ?? "",
    category_type: data.accounting_categories?.type,
  };
}

export async function updateEntry(id: string, payload: {
  type?: "income" | "expense";
  accountId?: string;
  categoryId?: string;
  amount?: number;
  entryDate?: string;
  remarks?: string | null;
}) {
  await requireManagerOrAdminOrThrow();
  const updates: any = {};
  if (payload.type) {
    if (!["income", "expense"].includes(payload.type)) return { success: false, error: "Invalid entry type" };
    updates.type = payload.type;
  }
  if (payload.amount !== undefined) {
    if (payload.amount <= 0) return { success: false, error: "Amount must be positive" };
    updates.amount = payload.amount;
  }
  if (payload.accountId) {
    updates.account_id = payload.accountId;
    const supabase = await createClient();
    const { data: account } = await supabase
      .from("accounting_accounts")
      .select("status")
      .eq("id", payload.accountId)
      .single();
    if (!account || account.status !== "active") {
      return { success: false, error: "Account must be active" };
    }
  }
  if (payload.categoryId) {
    updates.category_id = payload.categoryId;
    const supabase = await createClient();
    const { data: category } = await supabase
      .from("accounting_categories")
      .select("type,status")
      .eq("id", payload.categoryId)
      .single();
    if (!category || category.status !== "active") {
      return { success: false, error: "Category must be active" };
    }
    if (payload.type && category.type !== payload.type) {
      return { success: false, error: "Category does not match entry type" };
    }
  }
  if (payload.entryDate) updates.entry_date = payload.entryDate;
  if (payload.remarks !== undefined) updates.remarks = payload.remarks?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("accounting_entries").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteEntry(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.from("accounting_entries").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getAccounts(filters: AccountFilterParams = {}) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const pagination = normalizePagination(filters.page, filters.limit);
  let query = supabase.from("accounting_accounts").select("*");

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }
  const status = normalizeStatus(filters.status);
  if (status) query = query.eq("status", status);

  const orderBy = sanitizeSort(filters.sortBy, "name");
  const ascending = filters.sortOrder !== "desc";
  query = query.order(orderBy, { ascending }).range(pagination.from, pagination.to);

  const { data: accounts, count, error } = await query;
  if (error) throw new Error(error.message);
  const accountRows = accounts ?? [];
  const accountIds = accountRows.map((account: AccountingAccount) => account.id);

  const totalsResponse = accountIds.length
    ? await supabase
        .from("accounting_entries")
        .select("account_id,type,amount")
        .in("account_id", accountIds)
    : { data: [], error: null };

  if (totalsResponse.error) throw new Error(totalsResponse.error.message);

  const totalsByAccount = (totalsResponse.data ?? []).reduce((acc: Record<string, { total_in: number; total_out: number; count: number }>, entry: any) => {
    const key = entry.account_id;
    if (!acc[key]) acc[key] = { total_in: 0, total_out: 0, count: 0 };
    if (entry.type === "income") acc[key].total_in += Number(entry.amount);
    if (entry.type === "expense") acc[key].total_out += Number(entry.amount);
    acc[key].count += 1;
    return acc;
  }, {});

  const mapped = accountRows.map((account: AccountingAccount) => {
    const totals = totalsByAccount[account.id] ?? { total_in: 0, total_out: 0, count: 0 };
    return {
      ...account,
      total_in: totals.total_in,
      total_out: totals.total_out,
      current_balance: Number(account.opening_balance) + totals.total_in - totals.total_out,
      entry_count: totals.count,
    };
  });

  return { accounts: mapped, count: count ?? 0, page: pagination.page, limit: pagination.limit };
}

export async function getAccountById(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data: account, error } = await supabase.from("accounting_accounts").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!account) return null;

  const entriesResponse = await supabase
    .from("accounting_entries")
    .select("type, amount")
    .eq("account_id", id);
  if (entriesResponse.error) throw new Error(entriesResponse.error.message);
  const totals = (entriesResponse.data ?? []).reduce(
    (acc, entry: any) => {
      if (entry.type === "income") acc.total_in += Number(entry.amount);
      if (entry.type === "expense") acc.total_out += Number(entry.amount);
      acc.count += 1;
      return acc;
    },
    { total_in: 0, total_out: 0, count: 0 }
  );

  return {
    ...account,
    total_in: totals.total_in,
    total_out: totals.total_out,
    current_balance: Number(account.opening_balance) + totals.total_in - totals.total_out,
    entry_count: totals.count,
  };
}

export async function getAccountEntries(
  accountId: string,
  filters: EntryFilterParams = {}
) {
  return getEntries({ ...filters, accountId, page: filters.page, limit: filters.limit });
}

export async function createAccount(payload: { name: string; openingBalance: number; status?: RecordStatus }) {
  await requireManagerOrAdminOrThrow();
  if (!payload.name.trim()) return { success: false, error: "Account name required" };
  if (payload.openingBalance < 0) return { success: false, error: "Opening balance cannot be negative" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("accounting_accounts")
    .insert([
      {
        name: payload.name.trim(),
        opening_balance: payload.openingBalance,
        status: payload.status ?? "active",
        created_by: user.id,
      },
    ])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateAccount(
  id: string,
  payload: { name?: string; openingBalance?: number; status?: RecordStatus }
) {
  await requireManagerOrAdminOrThrow();
  if (payload.name !== undefined && !payload.name.trim()) {
    return { success: false, error: "Account name required" };
  }
  if (payload.openingBalance !== undefined && payload.openingBalance < 0) {
    return { success: false, error: "Opening balance cannot be negative" };
  }

  const updates: any = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.openingBalance !== undefined) updates.opening_balance = payload.openingBalance;
  if (payload.status !== undefined) updates.status = payload.status;

  const supabase = await createClient();
  const { error } = await supabase.from("accounting_accounts").update(updates).eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteAccount(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("accounting_entries")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);
  if (countError) return { success: false, error: countError.message };
  if (count && count > 0) return { success: false, error: "Cannot delete account with linked entries" };
  const { error } = await supabase.from("accounting_accounts").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getCategories(filters: CategoryFilterParams = {}) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const pagination = normalizePagination(filters.page, filters.limit);
  let query = supabase.from("accounting_categories").select("*");
  if (filters.search) query = query.ilike("name", `%${filters.search}%`);
  if (filters.type && filters.type !== "all") query = query.eq("type", filters.type);
  const status = normalizeStatus(filters.status);
  if (status) query = query.eq("status", status);
  const orderBy = sanitizeSort(filters.sortBy, "name");
  const ascending = filters.sortOrder !== "desc";
  query = query.order(orderBy, { ascending }).range(pagination.from, pagination.to);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { categories: data ?? [], count: count ?? 0, page: pagination.page, limit: pagination.limit };
}

export async function createCategory(payload: {
  name: string;
  type: "income" | "expense";
  status?: RecordStatus;
}) {
  await requireManagerOrAdminOrThrow();
  if (!payload.name.trim()) return { success: false, error: "Category name required" };
  if (!["income", "expense"].includes(payload.type)) return { success: false, error: "Invalid category type" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const { data, error } = await supabase
    .from("accounting_categories")
    .insert([
      {
        name: payload.name.trim(),
        type: payload.type,
        status: payload.status ?? "active",
        created_by: user.id,
      },
    ])
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateCategory(
  id: string,
  payload: { name?: string; type?: "income" | "expense"; status?: RecordStatus }
) {
  await requireManagerOrAdminOrThrow();
  if (payload.name !== undefined && !payload.name.trim()) {
    return { success: false, error: "Category name required" };
  }
  if (payload.type !== undefined && !["income", "expense"].includes(payload.type)) {
    return { success: false, error: "Invalid category type" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("accounting_categories").update(payload).eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getCategoryById(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounting_categories").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCategory(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("accounting_entries")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (countError) return { success: false, error: countError.message };
  if (count && count > 0) return { success: false, error: "Cannot delete category linked to entries" };
  const { error } = await supabase.from("accounting_categories").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

function toCsv(rows: Record<string, unknown>[], headers: string[]) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((key) => {
      const cell = row[key] ?? "";
      const text = String(cell).replace(/"/g, '""');
      return `"${text}"`;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function buildEntriesCsv(filters: EntryFilterParams = {}) {
  const result = await getEntries({ ...filters, page: 1, limit: 1000, sortBy: "entry_date", sortOrder: "desc" });
  const rows = result.entries.map((entry) => ({
    Date: entry.entry_date,
    Type: entry.type,
    Account: entry.account_name || entry.account_id,
    Category: entry.category_name || entry.category_id,
    Amount: entry.amount,
    Remarks: entry.remarks ?? "",
  }));
  return toCsv(rows, ["Date", "Type", "Account", "Category", "Amount", "Remarks"]);
}

export async function buildAccountsCsv(filters: AccountFilterParams = {}) {
  const result = await getAccounts(filters);
  const rows = result.accounts.map((account) => ({
    Name: account.name,
    OpeningBalance: account.opening_balance,
    TotalIn: account.total_in ?? 0,
    TotalOut: account.total_out ?? 0,
    CurrentBalance: account.current_balance ?? 0,
    Status: account.status,
  }));
  return toCsv(rows, ["Name", "OpeningBalance", "TotalIn", "TotalOut", "CurrentBalance", "Status"]);
}

export async function buildCategoriesCsv(filters: CategoryFilterParams = {}) {
  const result = await getCategories(filters);
  const rows = result.categories.map((category) => ({
    Name: category.name,
    Type: category.type,
    Status: category.status,
  }));
  return toCsv(rows, ["Name", "Type", "Status"]);
}
