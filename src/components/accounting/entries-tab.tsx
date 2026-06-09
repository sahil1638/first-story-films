"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { addEntry, deleteEntry, updateEntry } from "@/lib/actions/accounting";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AccountingEntry, AccountingAccount, AccountingCategory } from "@/types/database";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Pagination } from "@/components/ui/pagination";

interface EntriesTabProps {
  entries: AccountingEntry[];
  accounts: AccountingAccount[];
  categories: AccountingCategory[];
}

function amountToneClass(value: number) {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-stone-600";
}

export function EntriesTab({ entries, accounts, categories }: EntriesTabProps) {
  const router = useRouter();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchRemarks, setSearchRemarks] = useState<string>("");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [
    filterType,
    filterAccount,
    filterCategory,
    searchRemarks,
    dateStart,
    dateEnd,
  ]);

  // Confirmation Modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Entry Modal states
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountingEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Edit form states
  const [editForm, setEditForm] = useState({
    amount: "",
    entry_date: "",
    remarks: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (editConfirmOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editConfirmOpen]);

  // CSV Export handler
  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterType !== "all") params.append("type", filterType);
    if (filterAccount !== "all") params.append("accountId", filterAccount);
    if (filterCategory !== "all") params.append("categoryId", filterCategory);
    if (searchRemarks.trim()) params.append("search", searchRemarks.trim());
    if (dateStart) params.append("dateFrom", dateStart);
    if (dateEnd) params.append("dateTo", dateEnd);

    const url = `/api/accounting/entries/export?${params.toString()}`;
    window.location.href = url;
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterType !== "all" && e.type !== filterType) return false;
      if (filterAccount !== "all" && e.account_id !== filterAccount) return false;
      if (filterCategory !== "all" && e.category_id !== filterCategory) return false;
      const remarksQuery = searchRemarks.trim().toLowerCase();
      if (remarksQuery && !(e.remarks ?? "").toLowerCase().includes(remarksQuery))
        return false;
      if (dateStart && e.entry_date < dateStart) return false;
      if (dateEnd && e.entry_date > dateEnd) return false;
      return true;
    });
  }, [entries, filterType, filterAccount, filterCategory, searchRemarks, dateStart, dateEnd]);

  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);

  const displayedEntries = useMemo(() => {
    return filteredEntries.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredEntries, currentPage]);

  // Calculate totals
  const totals = useMemo(() => {
    const income = filteredEntries
      .filter((e) => e.type === "income")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const expense = filteredEntries
      .filter((e) => e.type === "expense")
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      income,
      expense,
      net: income - expense,
      count: filteredEntries.length,
    };
  }, [filteredEntries]);

  const headerActions = mounted ? document.getElementById("accounting-header-actions") : null;

  function handleDeleteClick(id: string) {
    setDeletingEntryId(id);
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingEntryId) return;
    setDeleting(true);
    setError("");
    try {
      const result = await deleteEntry(deletingEntryId);
      if (!result.success) {
        setError(result.error || "Failed to delete entry");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setDeletingEntryId(null);
    }
  }

  function handleEditClick(entry: AccountingEntry) {
    setEditingEntry(entry);
    setEditForm({
      amount: String(entry.amount),
      entry_date: entry.entry_date,
      remarks: entry.remarks || "",
    });
    setEditConfirmOpen(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    setError("");

    const parsedAmount = Number(editForm.amount);
    if (!editForm.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!editForm.entry_date) {
      setError("Please select an entry date.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateEntry(editingEntry.id, {
        amount: parsedAmount,
        entry_date: editForm.entry_date,
        remarks: editForm.remarks.trim(),
      });
      if (!result.success) {
        setError(result.error || "Failed to update entry");
      } else {
        setEditConfirmOpen(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {headerActions && createPortal(
        <>
          <Button
            onClick={() => setShowAddIncome(!showAddIncome)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            tooltip="Add Income"
          >
            <Plus className="h-4 w-4" />
            Add Income
          </Button>
          <Button
            onClick={() => setShowAddExpense(!showAddExpense)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
            tooltip="Add Expense"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </>,
        headerActions
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-stone-500">Total Income</p>
          <p className="text-xl font-bold text-green-600">+{formatCurrency(totals.income)}</p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500">Total Expense</p>
          <p className="text-xl font-bold text-red-600">-{formatCurrency(totals.expense)}</p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500">Net Amount</p>
          <p className={`text-xl font-bold ${amountToneClass(totals.net)}`}>
            {totals.net > 0 ? "+" : totals.net < 0 ? "-" : ""}
            {formatCurrency(Math.abs(totals.net))}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500">Transactions</p>
          <p className="text-xl font-bold text-stone-900">{totals.count}</p>
        </Card>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Add Income/Expense Forms */}
      {(showAddIncome || showAddExpense) && (
        <AddEntryForm
          type={showAddIncome ? "income" : "expense"}
          accounts={accounts}
          categories={categories}
          onClose={() => {
            setShowAddIncome(false);
            setShowAddExpense(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      {/* Entries Table */}
      <Card className="p-0 md:p-0 overflow-hidden">
        <div className="p-3 md:p-4">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-[1fr_1fr_1fr_1.2fr_1fr_1fr_auto] items-end">
              <Select
                label="Type"
                options={[
                  { value: "all", label: "All Types" },
                  { value: "income", label: "Income" },
                  { value: "expense", label: "Expense" },
                ]}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              />
              <Select
                label="Account"
                options={[
                  { value: "all", label: "All Accounts" },
                  ...accounts.map((a) => ({ value: a.id, label: a.name })),
                ]}
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
              />
              <Select
                label="Category"
                options={[
                  { value: "all", label: "All Categories" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              />
              <Input
                label="Remarks"
                type="text"
                placeholder="Search remarks..."
                value={searchRemarks}
                onChange={(e) => setSearchRemarks(e.target.value)}
              />
              <Input
                label="From Date"
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
              <Input
                label="To Date"
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterType("all");
                    setFilterAccount("all");
                    setFilterCategory("all");
                    setSearchRemarks("");
                    setDateStart("");
                    setDateEnd("");
                  }}
                  tooltip="Reset"
                  className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  tooltip="Export"
                  className="h-10 px-4 flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                <th className="px-4 py-1.5 md:px-5 font-medium">Date</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Type</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Account</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Category</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium">Amount</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Remarks</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-500">
                    No entries found
                  </td>
                </tr>
              ) : (
                displayedEntries.map((entry) => {
                  const account = accounts.find((a) => a.id === entry.account_id);
                  const category = categories.find((c) => c.id === entry.category_id);
                  return (
                    <tr key={entry.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-1.5 md:px-5">{formatDate(entry.entry_date)}</td>
                      <td className="px-4 py-1.5 md:px-5">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${
                            entry.type === "income" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 md:px-5">{account?.name || "—"}</td>
                      <td className="px-4 py-1.5 md:px-5">{category?.name || "—"}</td>
                      <td
                        className={`px-4 py-1.5 md:px-5 text-right font-medium ${
                          entry.type === "income" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {entry.type === "income" ? "+" : "-"}
                        {formatCurrency(Number(entry.amount))}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-stone-600">{entry.remarks || "—"}</td>
                      <td className="px-4 py-1.5 md:px-5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditClick(entry)}
                            tooltip="Edit"
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteClick(entry.id)}
                            tooltip="Delete"
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredEntries.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </Card>

      {/* Edit Modal (Portal-escaped) */}
      {mounted && editConfirmOpen && editingEntry && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setEditConfirmOpen(false)}
          />

          {/* Modal Box */}
          <form
            onSubmit={handleEditSave}
            className="relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setEditConfirmOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Edit Transaction Entry
            </h3>

            {/* Metadata (Read-only values) */}
            <div className="mb-4 grid grid-cols-[0.8fr_1.1fr_1.2fr] gap-4 rounded-lg border border-stone-300 bg-white px-4 py-3 text-xs shadow-sm">
              <div className="min-w-0">
                <span className="mb-2 block font-bold leading-none text-stone-600">TYPE</span>
                <span
                  className={`font-semibold uppercase ${
                    editingEntry.type === "income" ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {editingEntry.type}
                </span>
              </div>
              <div className="min-w-0">
                <span className="mb-2 block font-bold leading-none text-stone-600">ACCOUNT</span>
                <span className="block truncate font-semibold text-stone-900">
                  {accounts.find((a) => a.id === editingEntry.account_id)?.name || "—"}
                </span>
              </div>
              <div className="min-w-0">
                <span className="mb-2 block font-bold leading-none text-stone-600">CATEGORY</span>
                <span className="block truncate font-semibold text-stone-900">
                  {categories.find((c) => c.id === editingEntry.category_id)?.name || "—"}
                </span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Amount *"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount *"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              />

              <Input
                label="Entry Date *"
                type="date"
                value={editForm.entry_date}
                onChange={(e) => setEditForm({ ...editForm, entry_date: e.target.value })}
              />

              <Input
                label="Remarks"
                type="text"
                placeholder="Remarks (optional)"
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
              />
            </div>

            {/* Modal Actions */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditConfirmOpen(false)}
                disabled={saving}
                tooltip="Cancel"
                className="w-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="w-full"
                tooltip="Save"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteConfirmOpen(false);
            setDeletingEntryId(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Transaction Entry"
        message="Are you sure you want to permanently delete this accounting entry?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

function AddEntryForm({
  type,
  accounts,
  categories,
  onClose,
  onError,
}: {
  type: "income" | "expense";
  accounts: AccountingAccount[];
  categories: AccountingCategory[];
  onClose: () => void;
  onError: (error: string) => void;
}) {
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const filteredCategories = categories.filter((c) => c.type === type && c.status === "active");
  const activeAccounts = accounts.filter((a) => a.status === "active");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError("");

    const parsedAmount = Number(amount);
    if (!accountId) {
      onError("Please select an account.");
      return;
    }
    if (!categoryId) {
      onError("Please select a category.");
      return;
    }
    if (!amount || Number.isNaN(parsedAmount)) {
      onError("Please enter an amount.");
      return;
    }
    if (parsedAmount <= 0) {
      onError("Amount must be greater than zero.");
      return;
    }
    if (!entryDate) {
      onError("Please select an entry date.");
      return;
    }

    setLoading(true);
    const result = await addEntry(type, accountId, categoryId, parsedAmount, entryDate, remarks.trim());
    setLoading(false);

    if (!result.success) {
      onError(result.error || "Failed to add entry");
    } else {
      onClose();
    }
  }

  return (
    <Card className="bg-stone-50">
      <CardHeader title={`Add ${type === "income" ? "Income" : "Expense"}`} />
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Account *"
            options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
          <Select
            label="Category *"
            options={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount *"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Remarks (optional)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="sm:col-span-2"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700" tooltip="Save">
            {loading ? "Adding..." : "Add Entry"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} tooltip="Cancel">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
