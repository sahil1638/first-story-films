"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { allocateCrew } from "@/lib/actions/orders";

type Allocation = { crew_member_id: string };
type OrderService = {
  id: string;
  service_id: string;
  person_count: number;
  order_service_allocations?: Allocation[] | null;
};

type CrewMember = {
  id: string;
  name: string;
  crew_member_services?: { service_id: string }[] | null;
};

type Service = { id: string; name: string };

export function OrderCrewAllocation({
  orderId,
  orderServices,
  crew,
  services,
}: {
  orderId: string;
  orderServices: OrderService[];
  crew: CrewMember[];
  services: Service[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const serviceNames = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services]
  );
  const initialSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const orderService of orderServices) {
      map[orderService.id] =
        orderService.order_service_allocations?.map((allocation) => allocation.crew_member_id) ?? [];
    }
    return map;
  }, [orderServices]);

  const [selectedByService, setSelectedByService] = useState<Record<string, string[]>>(initialSelections);

  useEffect(() => {
    setSelectedByService(initialSelections);
  }, [initialSelections]);

  function eligibleForService(serviceId: string) {
    return crew.filter((member) =>
      (member.crew_member_services ?? []).some((service) => service.service_id === serviceId)
    );
  }

  const hasChanges = orderServices.some((orderService) => {
    const current = [...(selectedByService[orderService.id] ?? [])].sort().join(",");
    const initial = [...(initialSelections[orderService.id] ?? [])].sort().join(",");
    return current !== initial;
  });

  async function saveAllAllocations() {
    setSaving(true);
    try {
      for (const orderService of orderServices) {
        const max = Math.max(1, orderService.person_count);
        const selectedIds = (selectedByService[orderService.id] ?? []).slice(0, max);
        const current = [...selectedIds].sort().join(",");
        const initial = [...(initialSelections[orderService.id] ?? [])].sort().join(",");

        if (current !== initial) {
          await allocateCrew(orderId, orderService.id, selectedIds);
        }
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save allocations");
    } finally {
      setSaving(false);
    }
  }

  if (orderServices.length === 0) {
    return null;
  }

  return (
    <Card className="!p-3">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Service Person Allocation</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
            {orderServices.length} service{orderServices.length !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            loading={saving}
            disabled={!hasChanges}
            onClick={saveAllAllocations}
            tooltip="Save"
          >
            Save
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {orderServices.map((orderService) => {
          const eligible = eligibleForService(orderService.service_id);
          const max = Math.max(1, orderService.person_count);
          const selected = selectedByService[orderService.id] ?? [];

          return (
            <CrewRow
              key={orderService.id}
              label={serviceNames.get(orderService.service_id) ?? orderService.service_id}
              max={max}
              eligible={eligible}
              selected={selected}
              onChange={(nextSelected) =>
                setSelectedByService((current) => ({
                  ...current,
                  [orderService.id]: nextSelected,
                }))
              }
            />
          );
        })}
      </div>
    </Card>
  );
}

function CrewRow({
  label,
  max,
  eligible,
  selected,
  onChange,
}: {
  label: string;
  max: number;
  eligible: CrewMember[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCrew = eligible.filter((member) => selected.includes(member.id));

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((selectedId) => selectedId !== id));
      return;
    }

    if (selected.length < max) {
      onChange([...selected, id]);
    }
  }

  function remove(id: string) {
    onChange(selected.filter((selectedId) => selectedId !== id));
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-stone-900">{label}</p>
          <p className="mt-0.5 text-xs font-medium text-stone-500">
            {selected.length}/{max} selected
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
          Max {max}
        </span>
      </div>

      {eligible.length === 0 ? (
        <p className="rounded-lg bg-white p-3 text-sm text-stone-500 ring-1 ring-stone-200">
          No crew in master for this service. Add crew with this service in Masters.
        </p>
      ) : (
        <div className="space-y-3">
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-2 text-left text-sm font-medium text-stone-800 shadow-sm transition-colors hover:border-amber-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <span>{selected.length > 0 ? `${selected.length} crew selected` : "Select crew member..."}</span>
              <ChevronDown
                className={`h-4 w-4 text-stone-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                {eligible.map((member) => {
                  const isSelected = selected.includes(member.id);
                  const isDisabled = !isSelected && selected.length >= max;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => toggle(member.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-stone-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{member.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-amber-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCrew.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedCrew.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800"
                >
                  {member.name}
                  <button
                    type="button"
                    onClick={() => remove(member.id)}
                    className="rounded-full p-0.5 text-amber-700 hover:bg-amber-100"
                    aria-label={`Remove ${member.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-white px-3 py-2 text-sm text-stone-500 ring-1 ring-stone-200">
              No crew selected.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
