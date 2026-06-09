"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateQuotationDeliverables } from "@/lib/actions/quotations";
import type { Deliverable, Service } from "@/types/database";

export function QuotationEditor({
  quotationId,
  services,
  deliverables,
  initialDeliverables,
  initialServicePersons,
}: {
  quotationId: string;
  services: Service[];
  deliverables: Deliverable[];
  initialDeliverables: string[];
  initialServicePersons: { service_id: string; person_count: number }[];
}) {
  const router = useRouter();
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>(initialDeliverables);
  const [personCounts, setPersonCounts] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const s of services) map[s.id] = 1;
    for (const sp of initialServicePersons) map[sp.service_id] = sp.person_count;
    return map;
  });
  const [loading, setLoading] = useState(false);

  function toggleDeliverable(id: string) {
    setSelectedDeliverables((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function save() {
    setLoading(true);
    try {
      await updateQuotationDeliverables(
        quotationId,
        selectedDeliverables,
        services.map((s) => ({
          service_id: s.id,
          person_count: personCounts[s.id] ?? 1,
        }))
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Quotation Details" description="Service person counts & deliverables for PDF" />
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-sm font-medium text-stone-700">Service-wise Person Count</h4>
          {services.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((svc) => (
                <Input
                  key={svc.id}
                  label={svc.name}
                  type="number"
                  min={1}
                  value={personCounts[svc.id] ?? 1}
                  onChange={(e) =>
                    setPersonCounts((p) => ({ ...p, [svc.id]: Number(e.target.value) }))
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

        <div>
          <h4 className="mb-2 text-sm font-medium text-stone-700">Deliverables</h4>
          {deliverables.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {deliverables.map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedDeliverables.includes(d.id)}
                    onChange={() => toggleDeliverable(d.id)}
                  />
                  {d.title}
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-500">
              No customer-selected deliverables found for this quotation.
            </p>
          )}
        </div>

        <Button loading={loading} onClick={save} tooltip="Save">
          Save Quotation Details
        </Button>
      </div>
    </Card>
  );
}
