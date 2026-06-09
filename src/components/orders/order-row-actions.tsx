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
import { deleteOrder, updateOrderBasic } from "@/lib/actions/orders";
import { BUDGET_RANGES, ORDER_STATUSES } from "@/lib/constants";
import { calculateOrderBilling, formatCurrency, GST_RATE_PERCENT } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OrderRowActions({ order }: { order: any }) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [form, setForm] = useState({
    couple_name: order.couple_name || "",
    contact_number: order.contact_number || "",
    email: order.email || "",
    event_location: order.event_location || "",
    wedding_date: order.wedding_date || "",
    wedding_venue: order.wedding_venue || "",
    budget_range: order.budget_range || "",
    invoice_type: (order.invoice_type || "non_gst") as InvoiceType,
    total_amount: order.subtotal_amount ? String(order.subtotal_amount) : (order.total_amount ? String(order.total_amount) : "0"),
    status: order.status || "pending",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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
      // Sync form values on open
      const timer = setTimeout(() => {
        setForm({
          couple_name: order.couple_name || "",
          contact_number: order.contact_number || "",
          email: order.email || "",
          event_location: order.event_location || "",
          wedding_date: order.wedding_date || "",
          wedding_venue: order.wedding_venue || "",
          budget_range: order.budget_range || "",
          invoice_type: (order.invoice_type || "non_gst") as InvoiceType,
          total_amount: order.subtotal_amount ? String(order.subtotal_amount) : (order.total_amount ? String(order.total_amount) : "0"),
          status: order.status || "pending",
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
  }, [editConfirmOpen, order]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteOrder(order.id);
      setDeleteConfirmOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete order");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const nextErrors: Record<string, string> = {};
    if (!form.couple_name.trim()) nextErrors.couple_name = "Couple name is required";
    if (!form.contact_number.trim()) {
      nextErrors.contact_number = "Contact number is required";
    } else if (!/^\d{10}$/.test(form.contact_number.trim())) {
      nextErrors.contact_number = "Contact number must be exactly 10 digits";
    }
    if (!form.event_location.trim()) nextErrors.event_location = "Event location is required";
    if (!form.wedding_date) nextErrors.wedding_date = "Wedding date is required";
    if (!form.budget_range) nextErrors.budget_range = "Budget range is required";

    const parsedTotal = Number(form.total_amount);
    if (!form.total_amount.trim() || Number.isNaN(parsedTotal) || parsedTotal < 0) {
      nextErrors.total_amount = "Enter a valid order total amount";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await updateOrderBasic(order.id, {
        ...form,
        total_amount: parsedTotal,
      });
      setEditConfirmOpen(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setSaving(false);
    }
  }

  const budgetOptions = BUDGET_RANGES.map((b) => ({ value: b, label: b }));
  const billing = calculateOrderBilling(Number(form.total_amount), form.invoice_type);

  return (
    <div className="flex justify-end gap-1">
      <PdfDownloadButton
        url={`/api/orders/${order.id}/pdf`}
        filename={`order-${order.id.slice(0, 8)}.pdf`}
        tooltip="Download PDF"
        variant="ghost"
        className="h-7 w-7 rounded-lg p-0 flex items-center justify-center hover:bg-stone-100 transition-colors"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditConfirmOpen(true)}
        tooltip="Edit Order"
        className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
      >
        <Pencil className="h-4 w-4 text-stone-600 hover:text-amber-700 transition-colors" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDeleteConfirmOpen(true)}
        tooltip="Delete Order"
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
              Edit Order details
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
                label="Order Status"
                required
                placeholder="Select status..."
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options={ORDER_STATUSES as any}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                error={errors.status}
              />
              <Select
                label="Bill Type"
                required
                options={[
                  { value: "non_gst", label: "Non-GST Bill" },
                  { value: "gst", label: `GST Bill (${GST_RATE_PERCENT}%)` },
                ]}
                value={form.invoice_type}
                onChange={(e) => setForm({ ...form, invoice_type: e.target.value as InvoiceType })}
              />
              <Input
                label="Order Amount before GST (Rs.)"
                required
                type="number"
                min={0}
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                error={errors.total_amount}
              />
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-stone-500">Base amount</span>
                  <span className="font-medium">{formatCurrency(billing.baseAmount)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-stone-500">GST</span>
                  <span className="font-medium">
                    {form.invoice_type === "gst" ? formatCurrency(billing.gstAmount) : "-"}
                  </span>
                </div>
                <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                  <span>Final amount</span>
                  <span>{formatCurrency(billing.totalAmount)}</span>
                </div>
              </div>
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
        title="Delete Order"
        message={`Are you sure you want to permanently delete the order for "${order.couple_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
