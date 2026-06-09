"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Download, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { addAccount, deleteAccount, updateAccount } from "@/lib/actions/accounting";
import { formatCurrency } from "@/lib/utils";
import type { AccountingAccount, AccountingEntry, AccountingCategory } from "@/types/database";

interface AccountsTabProps {
  accounts: AccountingAccount[];
  entries: AccountingEntry[];
  categories?: AccountingCategory[];
}



export function AccountsTab({ accounts, entries }: AccountsTabProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState("");

  const [searchName, setSearchName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", openingBalance: "" });
  const [adding, setAdding] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountingAccount | null>(null);
  const [editForm, setEditForm] = useState({ name: "", status: "active" });
  const [saving, setSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (showAddModal || showEditModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showAddModal, showEditModal]);

  const accountsWithCalculations = useMemo(() => {
    return accounts.map((acc) => {
      const opening = Number(acc.opening_balance);
      const totalIn = entries
        .filter((e) => e.account_id === acc.id && e.type === "income")
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const totalOut = entries
        .filter((e) => e.account_id === acc.id && e.type === "expense")
        .reduce((sum, e) => sum + Number(e.amount), 0);

      return {
        ...acc,
        opening,
        totalIn,
        totalOut,
        current_balance: opening + totalIn - totalOut,
      };
    });
  }, [accounts, entries]);

  const filteredAccounts = useMemo(() => {
    return accountsWithCalculations.filter((acc) => {
      const matchesSearch = acc.name.toLowerCase().includes(searchName.trim().toLowerCase());
      const matchesStatus = filterStatus === "all" || acc.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [accountsWithCalculations, searchName, filterStatus]);

  const headerActions = mounted ? document.getElementById("accounting-header-actions") : null;

  function handleExport() {
    const url = `/api/accounting/accounts/export?search=${encodeURIComponent(searchName)}&status=${filterStatus}`;
    window.location.href = url;
  }

  async function handleToggleStatus(account: AccountingAccount) {
    setTogglingId(account.id);
    setError("");
    const newStatus = account.status === "active" ? "inactive" : "active";

    try {
      const res = await updateAccount(account.id, { status: newStatus });
      if (!res.success) {
        setError(res.error || "Failed to update status");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  }

  function handleAddClick() {
    setAddForm({ name: "", openingBalance: "0" });
    setError("");
    setShowAddModal(true);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!addForm.name.trim()) {
      setError("Account name is required.");
      return;
    }

    const balance = Number(addForm.openingBalance);
    if (Number.isNaN(balance) || balance < 0) {
      setError("Opening balance cannot be negative.");
      return;
    }

    setAdding(true);
    try {
      const res = await addAccount(addForm.name.trim(), balance);
      if (!res.success) {
        setError(res.error || "Failed to create account");
      } else {
        setShowAddModal(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setAdding(false);
    }
  }

  function handleEditClick(account: AccountingAccount) {
    setEditingAccount(account);
    setEditForm({ name: account.name, status: account.status });
    setError("");
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setError("");

    if (!editForm.name.trim()) {
      setError("Account name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateAccount(editingAccount.id, {
        name: editForm.name.trim(),
        status: editForm.status,
      });
      if (!res.success) {
        setError(res.error || "Failed to update account");
      } else {
        setShowEditModal(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(id: string) {
    setDeletingAccountId(id);
    setError("");
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingAccountId) return;
    setDeleting(true);
    setError("");

    try {
      const res = await deleteAccount(deletingAccountId);
      if (!res.success) {
        setError(res.error || "Failed to delete account");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setDeletingAccountId(null);
    }
  }

  return (
    <div className="space-y-6">
      {headerActions &&
        createPortal(
          <Button
            onClick={handleAddClick}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            tooltip="Add Account"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </Button>,
          headerActions
        )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card className="p-0 md:p-0 overflow-hidden">
        <div className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <Input
                label="Search Account Name"
                type="text"
                placeholder="Search by name..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                label="Status"
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchName("");
                  setFilterStatus("all");
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                <th className="px-4 py-1.5 md:px-5 font-medium">Account Name</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium">Opening Balance</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium text-green-600">Total In</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium text-red-600">Total Out</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium">Current Balance</th>
                <th className="px-4 py-1.5 md:px-5 text-center font-medium">Status</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-500">
                    No accounts found
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const hasEntries = entries.some((e) => e.account_id === acc.id);
                  return (
                    <tr
                      key={acc.id}
                      className="hover:bg-stone-50/50 transition-colors"
                    >
                      <td className="px-4 py-1.5 md:px-5 text-stone-900 hover:underline">
                        {acc.name}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-right text-stone-900 tabular-nums">
                        {formatCurrency(acc.opening)}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-right text-green-600 tabular-nums">
                        +{formatCurrency(acc.totalIn)}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-right text-red-600 tabular-nums">
                        -{formatCurrency(acc.totalOut)}
                      </td>
                      <td
                        className={`px-4 py-1.5 md:px-5 text-right font-bold tabular-nums ${
                          acc.current_balance >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(acc.current_balance)}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <Switch
                            checked={acc.status === "active"}
                            onChange={() => handleToggleStatus(acc)}
                            disabled={togglingId === acc.id}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-1.5 md:px-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditClick(acc)}
                            tooltip="Edit"
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={hasEntries}
                            onClick={() => handleDeleteClick(acc.id)}
                            tooltip={hasEntries ? "Disabled" : "Delete"}
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Trash2 className={`h-4 w-4 ${hasEntries ? "text-stone-300" : "text-red-500"}`} />
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
      </Card>

      {mounted && showAddModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setShowAddModal(false)}
          />

          <form
            onSubmit={handleAddSubmit}
            className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Add New Account
            </h3>

            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Account Name *"
                type="text"
                placeholder="e.g. HDFC Bank, Cash on Hand"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
              <Input
                label="Opening Balance (INR) *"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={addForm.openingBalance}
                onChange={(e) => setAddForm({ ...addForm, openingBalance: e.target.value })}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={adding}
                tooltip="Cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adding}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                tooltip="Save"
              >
                {adding ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {mounted && showEditModal && editingAccount && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setShowEditModal(false)}
          />

          <form
            onSubmit={handleEditSubmit}
            className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
          >
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Edit Account details
            </h3>

            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Account Name *"
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <Select
                label="Status *"
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
                tooltip="Cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-700 text-white"
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
            setDeletingAccountId(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Account"
        message="Are you sure you want to permanently delete this account?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default AccountsTab;
