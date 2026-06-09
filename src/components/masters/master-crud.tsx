"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Plus, X, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface Column {
  key: string;
  label: string;
}

interface MasterCrudProps {
  title: string;
  table: "services" | "events" | "deliverables";
  columns: Column[];
  nameField: string;
  nameLabel: string;
  items: Record<string, unknown>[];
}

export function MasterCrud({
  title,
  table,
  columns,
  nameField,
  nameLabel,
  items,
}: MasterCrudProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const query = search.toLowerCase().trim();
    return items.filter((item) => {
      return Object.entries(item).some(([key, val]) => {
        if (typeof val === "string") {
          return val.toLowerCase().includes(query);
        }
        return false;
      });
    });
  }, [items, search]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleToggleStatus(item: Record<string, unknown>) {
    const itemId = String(item.id);
    const currentStatus = String(item.status ?? "active");
    const nextStatus = currentStatus === "active" ? "inactive" : "active";

    setTogglingId(itemId);
    try {
      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          data: { status: nextStatus },
          id: itemId,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Failed to update status");
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  }

  function reset() {
    setOpen(false);
    setEditing(null);
    setName("");
    setStatus("active");
    setDescription("");
  }

  function startEdit(item: Record<string, unknown>) {
    setEditing(item);
    setName(String(item[nameField] ?? ""));
    setStatus(String(item.status ?? "active"));
    setDescription(String(item.description ?? ""));
    setOpen(true);
  }

  async function handleSave() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        [nameField]: name,
        status,
      };
      if (table === "services") {
        payload.description = description;
      }
      if (table === "deliverables") {
        payload.title = name;
        delete payload[nameField];
      }
      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          data: payload,
          id: editing?.id,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Save failed");
      }
      reset();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function performDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/masters?table=${table}&id=${deletingId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Delete failed");
      }
      setDeleteConfirmOpen(false);
      setDeletingId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">{title}</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase().replace(" master", "")}...`}
              className="w-full rounded-lg border border-stone-200 bg-white pl-9 pr-8 py-1.5 text-sm placeholder-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all duration-150 shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => { reset(); setOpen(true); }} tooltip="Add">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <Card className="p-0 md:p-0 overflow-hidden">
        {mounted && open && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
            {/* Backdrop with blur */}
            <div
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
              onClick={loading ? undefined : reset}
            />

            {/* Modal Box */}
            <div
              className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900"
              role="dialog"
              aria-modal="true"
            >
              {/* Close Button */}
              {!loading && (
                <button
                  type="button"
                  onClick={reset}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              )}

              {/* Modal Title */}
              <h3 className="text-lg font-bold text-stone-900 leading-6 mb-4">
                {editing ? `Edit ${title.replace(" Master", "")}` : `Add New ${title.replace(" Master", "")}`}
              </h3>

              {/* Form Fields */}
              <div className="space-y-4">
                <Input 
                  label={nameLabel} 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required 
                  autoFocus
                />
                
                {table === "services" && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-stone-700">
                      Service Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Enter service description for quotation PDF..."
                      rows={4}
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-stone-50 text-sm font-sans"
                    />
                  </div>
                )}

                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </div>

              {/* Footer Actions */}
              <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={reset}
                  className="w-full sm:w-auto rounded-xl cursor-pointer"
                  tooltip="Cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={loading}
                  onClick={handleSave}
                  className="w-full sm:w-auto rounded-xl px-6 py-2 shadow-md transition-all active:scale-95 duration-150 font-semibold cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
                  tooltip="Save"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-1.5 md:px-5 font-medium">{c.label}</th>
                ))}
                <th className="px-4 py-1.5 md:px-5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredItems.map((item) => (
                <tr key={String(item.id)} className="hover:bg-stone-50/50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-1.5 md:px-5 text-stone-600">
                      {c.key === "status" ? (
                        <Switch
                          checked={item.status === "active"}
                          onChange={() => handleToggleStatus(item)}
                          disabled={togglingId === String(item.id)}
                        />
                      ) : c.key === "created_at" ? (
                        new Date(String(item.created_at)).toLocaleDateString("en-IN")
                      ) : c.key === "description" ? (
                        <span className="text-xs text-stone-500 max-w-[250px] block truncate" title={String(item[c.key] ?? "")}>
                          {String(item[c.key] ?? "—")}
                        </span>
                      ) : c.key === nameField ? (
                        <span className="font-normal text-stone-900">{String(item[c.key] ?? "")}</span>
                      ) : (
                        String(item[c.key] ?? "")
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-1.5 md:px-5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)} tooltip="Edit" className="h-7 w-7 p-0 flex items-center justify-center rounded-lg">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setDeletingId(String(item.id)); setDeleteConfirmOpen(true); }} tooltip="Delete" className="h-7 w-7 p-0 flex items-center justify-center rounded-lg">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <p className="py-8 text-center text-stone-500">No records found.</p>
          )}
        </div>

        <ConfirmationModal
          isOpen={deleteConfirmOpen}
          onClose={() => { setDeleteConfirmOpen(false); setDeletingId(null); }}
          onConfirm={performDelete}
          title="Delete Record"
          message="Are you sure you want to permanently delete this record? This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          loading={deleting}
        />
      </Card>
    </div>
  );
}
