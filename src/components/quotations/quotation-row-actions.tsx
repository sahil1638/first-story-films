"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pencil, Trash2, X } from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { PdfDownloadButton } from "@/components/ui/pdf-download-button";
import { deleteQuotation, updateQuotationBasic } from "@/lib/actions/quotations";
import { BUDGET_RANGES, QUOTATION_STATUSES } from "@/lib/constants";
import type { Quotation, QuotationStatus } from "@/types/database";

export function QuotationRowActions({ quotation }: { quotation: Quotation }) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [form, setForm] = useState({
    couple_name: quotation.couple_name || "",
    your_name: quotation.your_name || "",
    contact_number: quotation.contact_number || "",
    email: quotation.email || "",
    event_location: quotation.event_location || "",
    wedding_date: quotation.wedding_date || "",
    wedding_venue: quotation.wedding_venue || "",
    budget_range: quotation.budget_range || "",
    status: quotation.status || "pending",
    amount: quotation.amount || 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (editConfirmOpen) {
      document.body.style.overflow = "hidden";
      // Sync form values on open
      const timer = setTimeout(() => {
        setForm({
          couple_name: quotation.couple_name || "",
          your_name: quotation.your_name || "",
          contact_number: quotation.contact_number || "",
          email: quotation.email || "",
          event_location: quotation.event_location || "",
          wedding_date: quotation.wedding_date || "",
          wedding_venue: quotation.wedding_venue || "",
          budget_range: quotation.budget_range || "",
          status: quotation.status || "pending",
          amount: quotation.amount || 0,
        });
        setErrors({});
      }, 0);
      return () => clearTimeout(timer);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editConfirmOpen, quotation]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteQuotation(quotation.id);
      setDeleteConfirmOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete quotation");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (!form.couple_name.trim()) nextErrors.couple_name = "Couple name is required";
    if (!form.your_name.trim()) nextErrors.your_name = "Contact name is required";
    if (!form.contact_number.trim()) {
      nextErrors.contact_number = "Contact number is required";
    } else if (!/^\d{10}$/.test(form.contact_number.trim())) {
      nextErrors.contact_number = "Contact number must be exactly 10 digits";
    }
    if (!form.event_location.trim()) nextErrors.event_location = "Event location is required";
    if (!form.wedding_date) nextErrors.wedding_date = "Wedding date is required";
    if (!form.budget_range) nextErrors.budget_range = "Budget range is required";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await updateQuotationBasic(quotation.id, {
        ...form,
        amount: Number(form.amount) || 0,
      });
      setEditConfirmOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update quotation");
    } finally {
      setSaving(false);
    }
  }

  const budgetOptions = BUDGET_RANGES.map((b) => ({ value: b, label: b }));

  return (
    <div className="flex justify-end gap-1">
      <PdfDownloadButton
        url={`/api/quotations/${quotation.id}/pdf`}
        filename={`quotation-${quotation.id.slice(0, 8)}.pdf`}
        tooltip="Download PDF"
        variant="ghost"
        className="h-7 w-7 rounded-lg p-0 flex items-center justify-center hover:bg-stone-100 transition-colors"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditConfirmOpen(true)}
        tooltip="Edit"
        className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
      >
        <Pencil className="h-4 w-4 text-stone-600 hover:text-amber-700 transition-colors" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDeleteConfirmOpen(true)}
        tooltip="Delete"
        className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
      >
        <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700 transition-colors" />
      </Button>

      {/* Edit Modal (Portal-escaped) */}
      {mounted && editConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setEditConfirmOpen(false)}
          />

          {/* Modal Box */}
          <form
            onSubmit={handleSave}
            className="relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
            role="dialog"
            aria-modal="true"
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
              Edit Quotation details
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1 space-y-4 pb-4">
              <Input
                label="Couple Name"
                required
                value={form.couple_name}
                onChange={(e) => setForm({ ...form, couple_name: e.target.value })}
                error={errors.couple_name}
              />
              <Input
                label="Contact Name"
                required
                value={form.your_name}
                onChange={(e) => setForm({ ...form, your_name: e.target.value })}
                error={errors.your_name}
              />
              <Input
                label="Contact Number"
                required
                type="tel"
                maxLength={10}
                value={form.contact_number}
                onChange={(e) => setForm({ ...form, contact_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                error={errors.contact_number}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={errors.email}
              />
              <Input
                label="Event Location"
                required
                value={form.event_location}
                onChange={(e) => setForm({ ...form, event_location: e.target.value })}
                error={errors.event_location}
              />
              <Input
                label="Wedding Date"
                required
                type="date"
                value={form.wedding_date}
                onChange={(e) => setForm({ ...form, wedding_date: e.target.value })}
                error={errors.wedding_date}
              />
              <Input
                label="Wedding Venue (Optional)"
                value={form.wedding_venue}
                onChange={(e) => setForm({ ...form, wedding_venue: e.target.value })}
                error={errors.wedding_venue}
              />
              <Select
                label="Budget Range"
                required
                placeholder="Select budget..."
                options={budgetOptions}
                value={form.budget_range}
                onChange={(e) => setForm({ ...form, budget_range: e.target.value })}
                error={errors.budget_range}
              />
              <Select
                label="Quotation Status"
                required
                placeholder="Select status..."
                options={QUOTATION_STATUSES}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as QuotationStatus })}
                error={errors.status}
              />
              <Input
                label="Quotation Amount (Rs.)"
                type="number"
                min={0}
                required
                value={String(form.amount)}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
                error={errors.amount}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-3 border-t border-stone-100">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setEditConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                loading={saving}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Quotation"
        message={`Are you sure you want to permanently delete the quotation for "${quotation.couple_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
