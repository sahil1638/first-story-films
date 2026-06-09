"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Pencil, X } from "lucide-react";
import { updateOrderStatus, updateOrderBasic } from "@/lib/actions/orders";
import { BUDGET_RANGES, ORDER_STATUSES } from "@/lib/constants";
import { calculateOrderBilling, formatCurrency, GST_RATE_PERCENT } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";

const OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "convert_to_production", label: "Convert to Production" },
  { value: "cancelled", label: "Cancelled" },
  { value: "complete", label: "Complete" },
];

export function OrderStatusActions({
  order,
}: {
  order: any;
}) {
  const router = useRouter();
  const orderId = order.id;
  const status = order.status;

  const [value, setValue] = useState(status);
  const [loading, setLoading] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
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
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (editConfirmOpen) {
      document.body.style.overflow = "hidden";
      // Sync form values on open
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
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editConfirmOpen, order]);

  async function save() {
    if (value === status) return;
    setLoading(true);
    try {
      await updateOrderStatus(orderId, value);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
      setValue(status);
    } finally {
      setLoading(false);
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
    <Card>
      <CardHeader title="Order status" />
      <div className="flex flex-wrap items-end gap-3 text-left">
        <div className="min-w-[220px] flex-1">
          <Select
            label="Status"
            options={OPTIONS}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditConfirmOpen(true)}
            className="flex items-center gap-1.5 font-semibold h-9"
            tooltip="Edit"
          >
            <Pencil className="h-4 w-4" />
            Edit Order
          </Button>
          <Button loading={loading} onClick={save} disabled={value === status} tooltip="Save" className="h-9">
            Update status
          </Button>
        </div>
      </div>

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
    </Card>
  );
}
