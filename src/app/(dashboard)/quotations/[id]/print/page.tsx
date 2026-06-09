import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";

export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();

  const [{ data: quotation }, { data: termsRow }] = await Promise.all([
    supabase
      .from("quotations")
      .select(
        "*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))"
      )
      .eq("id", id)
      .single(),
    supabase.from("settings").select("value").eq("key", "terms_and_conditions").maybeSingle(),
  ]);

  if (!quotation) notFound();

  const selectedServiceIds = new Set<string>();
  for (const day of quotation.quotation_function_days ?? []) {
    for (const service of day.quotation_function_day_services ?? []) {
      selectedServiceIds.add(service.service_id);
    }
  }

  const selectedDeliverableIds = (quotation.quotation_deliverables ?? []).map(
    (deliverable: { deliverable_id: string }) => deliverable.deliverable_id
  );
  const servicePersonCounts = new Map<string, number>();
  for (const servicePerson of quotation.quotation_service_persons ?? []) {
    if (selectedServiceIds.has(servicePerson.service_id)) {
      servicePersonCounts.set(servicePerson.service_id, servicePerson.person_count);
    }
  }

  const [{ data: services }, { data: deliverables }] = await Promise.all([
    selectedServiceIds.size > 0
      ? supabase.from("services").select("*").in("id", Array.from(selectedServiceIds))
      : Promise.resolve({ data: [] }),
    selectedDeliverableIds.length > 0
      ? supabase.from("deliverables").select("*").in("id", selectedDeliverableIds)
      : Promise.resolve({ data: [] }),
  ]);

  const terms = quotation.terms_and_conditions?.trim() || termsRow?.value || "";

  return (
    <div className="mx-auto max-w-4xl bg-white text-stone-900">
      <div className="no-print mb-6 flex flex-wrap gap-3">
        <Link href={`/quotations/${id}`}>
          <Button variant="outline" type="button" tooltip="Back">
            Back to quotation
          </Button>
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6 rounded-xl border border-stone-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">First Story Films</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Quotation</h1>
            <p className="mt-1 text-lg font-semibold text-stone-800">{quotation.couple_name}</p>
          </div>
          <div className="text-right text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Quotation #{id.slice(0, 8).toUpperCase()}</p>
            <p>Wedding Date: {formatDate(quotation.wedding_date)}</p>
            <p>Budget: {quotation.budget_range || "-"}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Customer</p>
          <p className="mt-2 font-semibold text-stone-900">{quotation.your_name || "-"}</p>
          <p className="text-stone-600">{quotation.contact_number}</p>
          {quotation.email && <p className="text-stone-600">{quotation.email}</p>}
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Event</p>
          <p className="mt-2 font-semibold text-stone-900">{quotation.event_location}</p>
          <p className="text-stone-600">Venue: {quotation.wedding_venue || "-"}</p>
          <p className="text-stone-600">Functions: {quotation.functions_count}</p>
        </div>
      </section>

      <section className="space-y-6 text-sm leading-relaxed text-stone-800">
        <div>
          <h2 className="mb-3 border-b border-stone-200 pb-2 text-base font-bold uppercase tracking-wide">
            Service-wise Person Count
          </h2>
          {(services ?? []).length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-stone-200">
              {(services ?? []).map((service) => (
                <div key={service.id} className="flex justify-between gap-4 border-b border-stone-200 px-4 py-3 last:border-b-0">
                  <span>{service.name}</span>
                  <span className="font-medium">{servicePersonCounts.get(service.id) ?? 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-500">No services selected for this quotation.</p>
          )}
        </div>

        <div>
          <h2 className="mb-3 border-b border-stone-200 pb-2 text-base font-bold uppercase tracking-wide">
            Deliverables
          </h2>
          {(deliverables ?? []).length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(deliverables ?? []).map((deliverable) => (
                <li key={deliverable.id} className="rounded border border-stone-200 px-3 py-2">
                  {deliverable.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500">No deliverables selected for this quotation.</p>
          )}
        </div>

        <div>
          <h2 className="mb-3 border-b border-stone-200 pb-2 text-base font-bold uppercase tracking-wide">
            Terms &amp; Conditions
          </h2>
          {terms ? (
            <div className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-4">
              {terms}
            </div>
          ) : (
            <p className="text-stone-500">
              No terms configured yet. Add quotation-specific terms or default terms under Settings.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
