import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { generateQuotationHtml } from "@/lib/quotation-template";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";

type QuotationFunctionDay = {
  day_index: number;
  day_date: string;
  first_event_id: string | null;
  second_event_id: string | null;
  quotation_function_day_services?: { service_id: string }[];
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireRole(["admin", "manager", "sales"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quotation }, { data: allSettings }] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))")
      .eq("id", id)
      .single(),
    supabase.from("settings").select("key, value"),
  ]);

  if (!quotation) notFound();

  const settingsMap: Record<string, string> = {};
  if (allSettings) {
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }
  }

  const functionDays = (quotation.quotation_function_days ?? []) as QuotationFunctionDay[];
  const selectedServiceIds = new Set<string>();
  const selectedEventIds = new Set<string>();
  for (const day of functionDays) {
    if (day.first_event_id) selectedEventIds.add(day.first_event_id);
    if (day.second_event_id) selectedEventIds.add(day.second_event_id);
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

  const [{ data: services }, { data: deliverables }, { data: events }] = await Promise.all([
    selectedServiceIds.size > 0
      ? supabase.from("services").select("*").in("id", Array.from(selectedServiceIds))
      : Promise.resolve({ data: [] }),
    selectedDeliverableIds.length > 0
      ? supabase.from("deliverables").select("*").in("id", selectedDeliverableIds)
      : Promise.resolve({ data: [] }),
    selectedEventIds.size > 0
      ? supabase.from("events").select("id, name").in("id", Array.from(selectedEventIds))
      : Promise.resolve({ data: [] }),
  ]);

  const serviceMap = new Map((services ?? []).map((service) => [service.id, service.name]));
  const eventMap = new Map((events ?? []).map((event) => [event.id, event.name]));
  const terms = quotation.terms_and_conditions?.trim() || settingsMap["terms_and_conditions"] || "No terms configured.";

  const htmlContent = generateQuotationHtml({
    quotation,
    services: services ?? [],
    events: events ?? [],
    deliverables: deliverables ?? [],
    terms,
    settings: settingsMap,
  });

  const pdf = await compileHtmlToPdf(htmlContent);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quotation-${id.slice(0, 8)}.pdf"`,
    },
  });
}
