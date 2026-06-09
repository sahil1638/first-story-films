"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateQuotationDeliverableSelection } from "@/lib/actions/quotations";

type DeliverableRow = {
  id: string;
  title: string;
};

export function DeliverablesSelection({
  quotationId,
  deliverables,
  initialDeliverables,
}: {
  quotationId: string;
  deliverables: DeliverableRow[];
  initialDeliverables: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initialDeliverables);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedDeliverables = useMemo(
    () => deliverables.filter((deliverable) => selected.includes(deliverable.id)),
    [deliverables, selected]
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleDeliverable(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function removeDeliverable(id: string) {
    setSelected((current) => current.filter((item) => item !== id));
  }

  async function saveDeliverables() {
    setSaving(true);
    setError("");
    try {
      await updateQuotationDeliverableSelection(quotationId, selected);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update deliverables");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Deliverables Selection</h3>
        </div>
        {deliverables.length > 0 && (
          <Button size="sm" onClick={saveDeliverables} loading={saving}>
            Save
          </Button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {deliverables.length > 0 ? (
        <>
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-amber-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <span>
                {selectedDeliverables.length > 0
                  ? `${selectedDeliverables.length} selected`
                  : "Select deliverables..."}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                {deliverables.map((deliverable) => {
                  const isSelected = selected.includes(deliverable.id);

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

          <div className="mt-3 min-h-10">
            {selectedDeliverables.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedDeliverables.map((deliverable) => (
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

        </>
      ) : (
        <p className="py-3 text-center text-stone-500">No active deliverables found.</p>
      )}
    </div>
  );
}
