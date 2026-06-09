"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import { convertQuotationToOrder, updateQuotationStatus, updateQuotationBasic } from "@/lib/actions/quotations";
import { BUDGET_RANGES, QUOTATION_STATUSES } from "@/lib/constants";
import { calculateOrderBilling, formatCurrency, GST_RATE_PERCENT } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";
import { QuotationStatusSelect } from "@/components/quotations/quotation-status-select";
import type { Quotation, Service, QuotationStatus } from "@/types/database";

type QuotationWithRelations = Quotation & {
  quotation_service_persons?: { service_id: string; person_count: number }[];
};

export function QuotationActions({
  quotation,
  services = [],
  deliverables = [],
  initialDeliverables = [],
}: {
  quotation: QuotationWithRelations;
  services?: Service[];
  deliverables?: { id: string; title: string }[];
  initialDeliverables?: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("non_gst");
  const [personCounts, setPersonCounts] = useState<Record<string, number>>({});
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>(initialDeliverables);
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  const quotationId = quotation.id;
  const status = quotation.status;

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
    if (editConfirmOpen || convertConfirmOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editConfirmOpen, convertConfirmOpen]);

  useEffect(() => {
    if (editConfirmOpen) {
      // Sync form values on open
      setTimeout(() => {
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
    }
  }, [editConfirmOpen, quotation]);

  useEffect(() => {
    if (convertConfirmOpen) {
      const map: Record<string, number> = {};
      for (const s of services) {
        map[s.id] = 1;
      }
      const existing = quotation.quotation_service_persons ?? [];
      for (const sp of existing) {
        map[sp.service_id] = sp.person_count;
      }
      setTimeout(() => {
        setPersonCounts(map);
        setSelectedDeliverables(initialDeliverables);
        setDeliverablesOpen(false);
        setTotalAmount(quotation.amount ? String(quotation.amount) : "");
      }, 0);
    }
  }, [convertConfirmOpen, services, quotation, initialDeliverables]);

  async function convert() {
    setConvertConfirmOpen(true);
  }

  async function handleConvertSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConvertConfirmOpen(false);
    setLoading(true);
    try {
      const servicePersons = services.map((s) => ({
        service_id: s.id,
        person_count: personCounts[s.id] ?? 1,
      }));
      const orderId = await convertQuotationToOrder(
        quotationId,
        totalAmount ? Number(totalAmount) : 0,
        invoiceType,
        servicePersons,
        selectedDeliverables
      );
      router.push(`/orders/${orderId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
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
  const convertBilling = calculateOrderBilling(Number(totalAmount), invoiceType);
  const selectedDeliverableRows = useMemo(
    () => deliverables.filter((deliverable) => selectedDeliverables.includes(deliverable.id)),
    [deliverables, selectedDeliverables]
  );

  function toggleDeliverable(id: string) {
    setSelectedDeliverables((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function removeDeliverable(id: string) {
    setSelectedDeliverables((current) => current.filter((item) => item !== id));
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-left">
      <QuotationStatusSelect
        quotationId={quotationId}
        status={status}
        onConvertToOrder={() => setConvertConfirmOpen(true)}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => setEditConfirmOpen(true)}
        className="flex items-center gap-1.5 font-semibold h-9"
        tooltip="Edit"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {status === "pending" && (
        <>
          <Button
            size="sm"
            loading={loading}
            onClick={convert}
            className="h-9"
            tooltip="Convert"
          >
            Convert to Order
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={async () => {
              await updateQuotationStatus(quotationId, "cancelled");
              router.refresh();
            }}
            tooltip="Cancel"
          >
            Cancel
          </Button>
        </>
      )}

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

      {/* Convert to Order Modal (Portal-escaped) */}
      {mounted && convertConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setConvertConfirmOpen(false)}
          />

          {/* Modal Box */}
          <form
            onSubmit={handleConvertSubmit}
            className="relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
            role="dialog"
            aria-modal="true"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setConvertConfirmOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Convert to Order & Set Details
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1 space-y-5 pb-4">
              <div>
                <h4 className="mb-3 text-sm font-semibold text-stone-805">
                  Service-wise Person Counts
                </h4>
                {services.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {services.map((svc) => (
                      <Input
                        key={svc.id}
                        label={`${svc.name} Count`}
                        type="number"
                        min={1}
                        required
                        value={personCounts[svc.id] ?? 1}
                        onChange={(e) =>
                          setPersonCounts((p) => ({
                            ...p,
                            [svc.id]: Number(e.target.value),
                          }))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500">
                    No customer-selected services found for this quotation.
                  </p>
                )}
              </div>

              <div className="border-t border-stone-100 pt-4">
                <h4 className="mb-3 text-sm font-semibold text-stone-800">
                  Deliverables Selection
                </h4>
                {deliverables.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setDeliverablesOpen((current) => !current)}
                        className="flex w-full items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-amber-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <span>
                          {selectedDeliverableRows.length > 0
                            ? `${selectedDeliverableRows.length} selected`
                            : "Select deliverables..."}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-stone-500 transition-transform ${deliverablesOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {deliverablesOpen && (
                        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                          {deliverables.map((deliverable) => {
                            const isSelected = selectedDeliverables.includes(deliverable.id);

                            return (
                              <button
                                key={deliverable.id}
                                type="button"
                                onClick={() => toggleDeliverable(deliverable.id)}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-stone-800 hover:bg-amber-50"
                              >
                                <span>{deliverable.title}</span>
                                {isSelected && <Check className="h-4 w-4 text-amber-600" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedDeliverableRows.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedDeliverableRows.map((deliverable) => (
                          <span
                            key={deliverable.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800"
                          >
                            {deliverable.title}
                            <button
                              type="button"
                              onClick={() => removeDeliverable(deliverable.id)}
                              className="rounded-full p-0.5 text-amber-700 hover:bg-amber-100"
                              aria-label={`Remove ${deliverable.title}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-500">
                        No deliverables selected.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500">
                    No active deliverables found.
                  </p>
                )}
              </div>

              <div className="space-y-4 border-t border-stone-100 pt-4">
                <Select
                  label="Bill Type"
                  required
                  options={[
                    { value: "non_gst", label: "Non-GST Bill" },
                    { value: "gst", label: `GST Bill (${GST_RATE_PERCENT}%)` },
                  ]}
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
                />
                <Input
                  label="Order Amount before GST (Rs.)"
                  type="number"
                  min={0}
                  required
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Enter order amount"
                />
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-stone-500">Base amount</span>
                    <span className="font-medium">{formatCurrency(convertBilling.baseAmount)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-500">GST</span>
                    <span className="font-medium">
                      {invoiceType === "gst" ? formatCurrency(convertBilling.gstAmount) : "-"}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-900">
                    <span>Final amount</span>
                    <span>{formatCurrency(convertBilling.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-3 border-t border-stone-100">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setConvertConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                loading={loading}
              >
                Convert to Order
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
