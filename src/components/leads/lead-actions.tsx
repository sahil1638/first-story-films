"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { convertLeadToQuotation, updateLeadStatus } from "@/lib/actions/leads";
import { Check, ChevronDown, FileText, Pencil, X } from "lucide-react";
import { PublicLeadForm } from "@/components/leads/public-lead-form";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { LeadStatusSelect } from "@/components/leads/lead-status-select";

export function LeadActions({
  lead,
  services = [],
  deliverables = [],
}: {
  lead: any;
  services?: any[];
  deliverables?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Convert to Quotation state
  const [personCounts, setPersonCounts] = useState<Record<string, number>>({});
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  const [amount, setAmount] = useState("0");

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Find all service IDs that are selected in lead's function days
  const leadServiceIds = useMemo(() => {
    const ids = new Set<string>();
    const days = lead.lead_function_days ?? [];
    for (const day of days) {
      const servicesList = day.lead_function_day_services ?? [];
      for (const s of servicesList) {
        ids.add(s.service_id);
      }
    }
    return Array.from(ids);
  }, [lead]);

  // Filter global services to only those selected in the lead
  const leadServices = useMemo(() => {
    return services.filter((s) => leadServiceIds.includes(s.id));
  }, [services, leadServiceIds]);

  const selectedDeliverableRows = useMemo(
    () => deliverables.filter((deliverable) => selectedDeliverables.includes(deliverable.id)),
    [deliverables, selectedDeliverables]
  );

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
    if (convertConfirmOpen) {
      const map: Record<string, number> = {};
      for (const s of leadServices) {
        map[s.id] = 1;
      }
      setPersonCounts(map);
      setSelectedDeliverables([]);
      setDeliverablesOpen(false);
      setAmount("0");
    }
  }, [convertConfirmOpen, leadServices]);

  const leadId = lead.id;
  const status = lead.status;

  async function handleConvertSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConvertConfirmOpen(false);
    setLoading(true);
    try {
      const servicePersons = leadServices.map((s) => ({
        service_id: s.id,
        person_count: personCounts[s.id] ?? 1,
      }));
      const quotationId = await convertLeadToQuotation(
        leadId,
        servicePersons,
        selectedDeliverables,
        Number(amount)
      );
      router.push(`/quotations/${quotationId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelConfirm() {
    setCancelConfirmOpen(false);
    setLoadingCancel(true);
    try {
      await updateLeadStatus(leadId, "cancelled");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel lead");
    } finally {
      setLoadingCancel(false);
    }
  }

  function handleEditSuccess() {
    setEditConfirmOpen(false);
    router.refresh();
  }

  const formattedLead = lead
    ? {
        ...lead,
        function_days: (lead.lead_function_days ?? []).map((fd: any) => ({
          day_index: fd.day_index,
          day_date: fd.day_date,
          first_event_id: fd.first_event_id || "",
          second_event_id: fd.second_event_id || "",
          service_ids: (fd.lead_function_day_services ?? []).map((s: any) => s.service_id),
        })),
      }
    : undefined;

  function toggleDeliverable(id: string) {
    setSelectedDeliverables((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function removeDeliverable(id: string) {
    setSelectedDeliverables((current) => current.filter((item) => item !== id));
  }

  return (
    <div className="flex gap-2 items-center text-left">
      <LeadStatusSelect
        leadId={leadId}
        status={status}
        onConvertToQuotation={() => setConvertConfirmOpen(true)}
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
            onClick={() => setConvertConfirmOpen(true)}
            className="flex items-center gap-1.5 font-semibold h-9"
            tooltip="Convert"
          >
            <FileText className="h-4 w-4" />
            Convert to Quotation
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={loadingCancel}
            onClick={() => setCancelConfirmOpen(true)}
            className="h-9"
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
          <div
            className="relative z-10 w-full max-w-2xl transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
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
              Edit Lead details
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1">
              <PublicLeadForm
                isDashboard={true}
                initialData={formattedLead}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditConfirmOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Convert to Quotation Modal (Portal-escaped) */}
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
              Convert to Quotation & Set Details
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1 space-y-5 pb-4">
              <div>
                <h4 className="mb-3 text-sm font-semibold text-stone-800">
                  Service-wise Person Counts
                </h4>
                {leadServices.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {leadServices.map((svc) => (
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
                    No lead services selected for this lead.
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

              <div className="border-t border-stone-100 pt-4">
                <h4 className="mb-3 text-sm font-semibold text-stone-800">
                  Quotation Pricing / Amount
                </h4>
                <Input
                  label="Quotation Amount (Rs.)"
                  type="number"
                  min={0}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter quotation amount"
                />
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
                Convert to Quotation
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={handleCancelConfirm}
        title="Cancel Lead"
        message={`Are you sure you want to cancel the lead for "${lead.couple_name || lead.your_name}"?`}
        confirmLabel="Yes, Cancel"
        cancelLabel="No, Keep Active"
        variant="danger"
        loading={loadingCancel}
      />
    </div>
  );
}
