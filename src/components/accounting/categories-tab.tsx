"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { addCategory, updateCategory, deleteCategory } from "@/lib/actions/accounting";
import type { AccountingCategory, AccountingEntry } from "@/types/database";

interface CategoriesTabProps {
  categories: AccountingCategory[];
  entries: AccountingEntry[];
}

export function CategoriesTab({ categories, entries }: CategoriesTabProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string>("");

  // Filters state
  const [searchName, setSearchName] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Add Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    type: "income" as "income" | "expense",
    status: "active" as "active" | "inactive",
  });
  const [adding, setAdding] = useState(false);

  // Edit Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AccountingCategory | null>(null);
  const [editForm, setEditForm] = useState({ name: "", status: "active" });
  const [saving, setSaving] = useState(false);

  // Delete Modal States
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline Toggling States
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Filter categories list based on controls
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch = cat.name.toLowerCase().includes(searchName.trim().toLowerCase());
      const matchesType = filterType === "all" || cat.type === filterType;
      const matchesStatus = filterStatus === "all" || cat.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [categories, searchName, filterType, filterStatus]);

  // CSV Export handler
  const handleExport = () => {
    const url = `/api/accounting/categories/export?search=${encodeURIComponent(searchName)}&type=${filterType}`;
    window.location.href = url;
  };

  // Inline status toggle handler
  const handleToggleStatus = async (category: AccountingCategory) => {
    setTogglingId(category.id);
    setError("");
    const newStatus = category.status === "active" ? "inactive" : "active";
    try {
      const res = await updateCategory(category.id, { status: newStatus });
      if (!res.success) {
        setError(res.error || "Failed to update category status");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category status");
    } finally {
      setTogglingId(null);
    }
  };

  // Add Category handlers
  const handleAddClick = () => {
    setAddForm({ name: "", type: "income", status: "active" });
    setError("");
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!addForm.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setAdding(true);
    try {
      const res = await addCategory(addForm.name.trim(), addForm.type, addForm.status);
      if (!res.success) {
        setError(res.error || "Failed to create category");
      } else {
        setShowAddModal(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setAdding(false);
    }
  };

  // Edit Category handlers
  const handleEditClick = (category: AccountingCategory) => {
    setEditingCategory(category);
    setEditForm({ name: category.name, status: category.status });
    setError("");
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setError("");

    if (!editForm.name.trim()) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await updateCategory(editingCategory.id, {
        name: editForm.name.trim(),
        status: editForm.status,
      });
      if (!res.success) {
        setError(res.error || "Failed to update category");
      } else {
        setShowEditModal(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSaving(false);
    }
  };

  // Delete Category handlers
  const handleDeleteClick = (id: string) => {
    setDeletingCategoryId(id);
    setError("");
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategoryId) return;
    setDeleting(true);
    setError("");
    try {
      const res = await deleteCategory(deletingCategoryId);
      if (!res.success) {
        setError(res.error || "Failed to delete category");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setDeletingCategoryId(null);
    }
  };

  const headerActions = mounted ? document.getElementById("accounting-header-actions") : null;

  return (
    <div className="space-y-6">
      {headerActions && createPortal(
        <Button
          onClick={handleAddClick}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          tooltip="Add Category"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </Button>,
        headerActions
      )}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card className="p-0 md:p-0 overflow-hidden">
        <div className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Search Category Name"
                  type="text"
                  placeholder="Search by name..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
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
                    setFilterType("all");
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

        <div className="overflow-x-auto border-t border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                <th className="px-4 py-1.5 md:px-5 font-medium">Category Name</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Type</th>
                <th className="px-4 py-1.5 md:px-5 text-center font-medium">Status</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                    No categories found
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const hasEntries = entries.some((e) => e.category_id === cat.id);
                  return (
                    <tr key={cat.id} className="hover:bg-stone-50/50">
                      <td className="px-4 py-1.5 md:px-5 text-stone-900">{cat.name}</td>
                      <td className="px-4 py-1.5 md:px-5">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${
                            cat.type === "income" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {cat.type}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={cat.status === "active"}
                            onChange={() => handleToggleStatus(cat)}
                            disabled={togglingId === cat.id}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-1.5 md:px-5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditClick(cat)}
                            tooltip="Edit"
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={hasEntries}
                            onClick={() => handleDeleteClick(cat.id)}
                            tooltip={
                              hasEntries
                                ? "Disabled"
                                : "Delete"
                            }
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

      {/* Add Category Modal */}
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
              Add New Category
            </h3>

            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Category Name *"
                type="text"
                placeholder="e.g. Photography Gear, Venue Supplies"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />

              <Select
                label="Transaction Type *"
                options={[
                  { value: "income", label: "Income" },
                  { value: "expense", label: "Expense" },
                ]}
                value={addForm.type}
                onChange={(e) => setAddForm({ ...addForm, type: e.target.value as "income" | "expense" })}
              />

              <Select
                label="Status *"
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={addForm.status}
                onChange={(e) => setAddForm({ ...addForm, status: e.target.value as "active" | "inactive" })}
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
                {adding ? "Creating..." : "Create Category"}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Edit Category Modal */}
      {mounted && showEditModal && editingCategory && createPortal(
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
              Edit Category details
            </h3>

            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Category Name *"
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

      {/* Confirmation Modal (Delete) */}
      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteConfirmOpen(false);
            setDeletingCategoryId(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Category"
        message="Are you sure you want to permanently delete this category?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default CategoriesTab;
