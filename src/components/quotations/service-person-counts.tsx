"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateQuotationServicePersons } from "@/lib/actions/quotations";

type ServiceRow = {
  id: string;
  name: string;
};

type ServicePersonRow = {
  service_id: string;
  person_count: number;
};

export function ServicePersonCounts({
  quotationId,
  services,
  servicePersons,
}: {
  quotationId: string;
  services: ServiceRow[];
  servicePersons: ServicePersonRow[];
}) {
  const router = useRouter();
  const initialCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const service of services) map[service.id] = 1;
    for (const servicePerson of servicePersons) {
      map[servicePerson.service_id] = Math.max(1, Number(servicePerson.person_count) || 1);
    }
    return map;
  }, [services, servicePersons]);

  const [counts, setCounts] = useState(initialCounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveCounts() {
    setSaving(true);
    setError("");
    try {
      await updateQuotationServicePersons(
        quotationId,
        services.map((service) => ({
          service_id: service.id,
          person_count: counts[service.id] ?? 1,
        }))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update service counts");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Service-wise Person Counts</h3>
        </div>
        {services.length > 0 && (
          <Button size="sm" onClick={saveCounts} loading={saving}>
            Save
          </Button>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {services.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((service) => (
              <Input
                key={service.id}
                label={`${service.name} Count`}
                type="number"
                min={1}
                required
                value={counts[service.id] ?? 1}
                onChange={(event) =>
                  setCounts((current) => ({
                    ...current,
                    [service.id]: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
              />
            ))}
          </div>
        </>
      ) : (
        <p className="py-3 text-center text-stone-500">No selected services found for this quotation.</p>
      )}
    </div>
  );
}
