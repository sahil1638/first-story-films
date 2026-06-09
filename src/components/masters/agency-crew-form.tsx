"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, X, Search } from "lucide-react";
import type { Service } from "@/types/database";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

type Mode = "agency" | "crew";

interface Item {
  id: string;
  status: string;
  name?: string;
  company_name?: string;
  person_name?: string;
  contact_number: string;
  address?: string | null;
  agency_services?: { service_id: string }[];
  crew_member_services?: { service_id: string }[];
}

export function AgencyCrewForm({
  mode,
  title,
  items,
  services,
}: {
  mode: Mode;
  title: string;
  items: Item[];
  services: Service[];
}) {
  const router = useRouter();
  const table = mode === "agency" ? "agencies" : "crew_members";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const query = search.toLowerCase().trim();
    return items.filter((item) => {
      return Object.entries(item).some(([key, val]) => {
        if (typeof val === "string") {
          return val.toLowerCase().includes(query);
        }
        if (key === "agency_services" || key === "crew_member_services") {
          const serviceNames = ((val as { service_id: string }[]) ?? [])
            .map((as) => services.find((s) => s.id === as.service_id)?.name)
            .filter((name): name is string => typeof name === "string");
          return serviceNames.some((name) => name.toLowerCase().includes(query));
        }
        return false;
      });
    });
  }, [items, search, services]);

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

  async function handleToggleStatus(item: Item) {
    const itemId = item.id;
    const currentStatus = item.status ?? "active";
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
          serviceIds: (mode === "agency"
            ? item.agency_services
            : item.crew_member_services
          )?.map((s) => s.service_id) ?? [],
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

  const [form, setForm] = useState({
    company_name: "",
    person_name: "",
    name: "",
    contact_number: "",
    address: "",
    status: "active",
    service_ids: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function reset() {
    setOpen(false);
    setEditing(null);
    setForm({
      company_name: "",
      person_name: "",
      name: "",
      contact_number: "",
      address: "",
      status: "active",
      service_ids: [],
    });
    setErrors({});
  }

  function startEdit(item: Item) {
    setEditing(item);
    setForm({
      company_name: item.company_name ?? "",
      person_name: item.person_name ?? "",
      name: item.name ?? "",
      contact_number: item.contact_number,
      address: item.address ?? "",
      status: item.status,
      service_ids: (mode === "agency"
        ? item.agency_services
        : item.crew_member_services
      )?.map((s) => s.service_id) ?? [],
    });
    setErrors({});
    setOpen(true);
  }

  function toggleService(id: string) {
    setForm((f) => ({
      ...f,
      service_ids: f.service_ids.includes(id)
        ? f.service_ids.filter((s) => s !== id)
        : [...f.service_ids, id],
    }));
  }

  function isValidPhone(value: string) {
    return /^\+?\d{10}$/.test(value.trim());
  }

  async function save() {
    setErrors({});
    const nextErrors: Record<string, string> = {};

    if (mode === "agency") {
      if (!form.company_name.trim()) {
        nextErrors.company_name = "Please enter the company name.";
      }
      if (!form.person_name.trim()) {
        nextErrors.person_name = "Please enter the contact person name.";
      }
    } else {
      if (!form.name.trim()) {
        nextErrors.name = "Please enter the name.";
      }
    }

    if (!form.contact_number.trim()) {
      nextErrors.contact_number = "Please enter a contact number.";
    } else if (!/^\+?[0-9]+$/.test(form.contact_number.trim())) {
      nextErrors.contact_number = "Contact number can only contain digits and an optional leading +.";
    } else if (!isValidPhone(form.contact_number)) {
      nextErrors.contact_number = "Contact number must be exactly 10 digits, with an optional leading +.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const payload =
        mode === "agency"
          ? {
              company_name: form.company_name,
              person_name: form.person_name,
              contact_number: form.contact_number,
              address: form.address || null,
              status: form.status,
            }
          : {
              name: form.name,
              contact_number: form.contact_number,
              address: form.address || null,
              status: form.status,
            };

      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table,
          data: payload,
          id: editing?.id,
          serviceIds: form.service_ids,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Save failed");
      }
      reset();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
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
      alert(e instanceof Error ? e.message : "Failed");
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
              placeholder={`Search ${mode === "agency" ? "agencies" : "crew"}...`}
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

      <Card className="p-0 md:p-0 overflow-hidden text-stone-900">
        {mounted && open && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
            {/* Backdrop with blur */}
            <div
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
              onClick={loading ? undefined : reset}
            />

            {/* Modal Box */}
            <div
              className="relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900"
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
                {editing
                  ? `Edit ${mode === "agency" ? "Agency" : "Crew Member"}`
                  : `Add New ${mode === "agency" ? "Agency" : "Crew Member"}`}
              </h3>

              {/* Form Fields */}
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {mode === "agency" ? (
                  <>
                    <Input
                      label="Company Name"
                      required
                      value={form.company_name}
                      onChange={(e) => {
                        setForm({ ...form, company_name: e.target.value });
                        if (errors.company_name) setErrors(prev => { const n = { ...prev }; delete n.company_name; return n; });
                      }}
                      error={errors.company_name}
                    />
                    <Input
                      label="Person Name"
                      required
                      value={form.person_name}
                      onChange={(e) => {
                        setForm({ ...form, person_name: e.target.value });
                        if (errors.person_name) setErrors(prev => { const n = { ...prev }; delete n.person_name; return n; });
                      }}
                      error={errors.person_name}
                    />
                  </>
                ) : (
                  <Input
                    label="Name"
                    required
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      if (errors.name) setErrors(prev => { const n = { ...prev }; delete n.name; return n; });
                    }}
                    error={errors.name}
                  />
                )}
                <Input
                  label="Contact Number"
                  required
                  type="tel"
                  inputMode="tel"
                  pattern="\+?[0-9]{10}"
                  placeholder="e.g. +1000000022"
                  value={form.contact_number}
                  onChange={(e) => {
                    const value = e.target.value.replace(/(?!^\+)\D/g, "");
                    const cleaned = value.startsWith("+") ? `+${value.slice(1).replace(/\+/g, "")}` : value.replace(/\+/g, "");
                    setForm({ ...form, contact_number: cleaned });
                    if (errors.contact_number) setErrors(prev => { const n = { ...prev }; delete n.contact_number; return n; });
                  }}
                  error={errors.contact_number}
                />
                <Input
                  label="Address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.service_ids.includes(s.id)}
                          onChange={() => toggleService(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
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
                  onClick={save}
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
                <th className="px-4 py-1.5 md:px-5 font-medium">{mode === "agency" ? "Company Name" : "Name"}</th>
                {mode === "agency" && <th className="px-4 py-1.5 md:px-5 font-medium">Contact Person</th>}
                <th className="px-4 py-1.5 md:px-5 font-medium">Contact Number</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Address</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Services</th>
                <th className="px-4 py-1.5 md:px-5 text-center font-medium">Status</th>
                <th className="px-4 py-1.5 md:px-5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={mode === "agency" ? 7 : 6} className="px-4 py-8 text-center text-stone-500">
                    No records found
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const itemServices = (mode === "agency"
                    ? item.agency_services
                    : item.crew_member_services
                  )?.map((as) => services.find((s) => s.id === as.service_id)?.name).filter(Boolean) ?? [];

                  return (
                    <tr key={item.id} className="hover:bg-stone-50/50 transition-colors duration-150">
                      <td className="px-4 py-1.5 md:px-5 font-normal text-stone-900">
                        {mode === "agency" ? item.company_name : item.name}
                      </td>
                      {mode === "agency" && (
                        <td className="px-4 py-1.5 md:px-5 text-stone-600 font-medium">
                          {item.person_name || "—"}
                        </td>
                      )}
                      <td className="px-4 py-1.5 md:px-5 text-stone-600 tabular-nums">
                        {item.contact_number}
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-stone-600 max-w-[200px] truncate">
                        {item.address || "—"}
                      </td>
                      <td className="px-4 py-1.5 md:px-5">
                        <div className="flex flex-wrap gap-1.5 max-w-xs sm:max-w-md lg:max-w-none">
                          {itemServices.length === 0 ? (
                            <span className="text-stone-400 text-xs">—</span>
                          ) : (
                            itemServices.map((name) => (
                              <Badge
                                key={name}
                                variant="default"
                                className="text-3xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/50 hover:bg-amber-50 font-semibold"
                              >
                                {name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-1.5 md:px-5 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={item.status === "active"}
                            onChange={() => handleToggleStatus(item)}
                            disabled={togglingId === item.id}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-1.5 md:px-5">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(item)}
                            tooltip="Edit"
                            className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeletingId(item.id);
                              setDeleteConfirmOpen(true);
                            }}
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

        <ConfirmationModal
          isOpen={deleteConfirmOpen}
          onClose={() => { setDeleteConfirmOpen(false); setDeletingId(null); }}
          onConfirm={performDelete}
          title="Delete Record"
          message={`Are you sure you want to permanently delete this ${mode === "agency" ? "agency" : "crew member"}? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          loading={deleting}
        />
      </Card>
    </div>
  );
}
