import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { generateQuotationHtml } from "@/lib/quotation-template";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";
import type { Event } from "@/types/database";
import { handleApiError } from "@/lib/security/api-errors";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { getCachedPdfArtifact, setCachedPdfArtifact } from "@/lib/pdf-cache";

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
  let profile;
  try {
    profile = await requireRoleOrThrow(["admin", "manager", "sales"]);
  } catch (error) {
    return handleApiError(error, { context: "quotations.pdf" });
  }

  const { id } = await params;
  const supabase = await createClient();

  // Perform lightweight metadata query first
  const { data: quoteMeta, error: metaError } = await supabase
    .from("quotations")
    .select("updated_at")
    .eq("id", id)
    .single();

  if (metaError || !quoteMeta) notFound();

  // 1. Per-user rate limit (cheap check before cache)
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userKey = profile ? `user:${profile.id}` : `ip:${ip}`;
  const allowed = await checkDbRateLimit(rateLimitKey("pdf", userKey), {
    maxTokens: 5,
    refillRatePerSec: 0.2,
    cost: 1.0,
    context: "quotations.pdf",
  });
  if (!allowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

  // 2. Cache check
  const cacheKey = `quotation:${id}`;
  const cached = await getCachedPdfArtifact(cacheKey, quoteMeta.updated_at);
  if (cached) {
    return new Response(new Uint8Array(cached), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quotation-${id.slice(0, 8)}.pdf"`,
      },
    });
  }

  // 3. Per-route rate limit (expensive rendering check only on cache miss)
  const routeAllowed = await checkDbRateLimit(rateLimitKey("pdf", "route-quotations"), {
    maxTokens: 10,
    refillRatePerSec: 0.5,
    cost: 1.0,
    context: "quotations.pdf.route",
  });
  if (!routeAllowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

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

  const terms = quotation.terms_and_conditions?.trim() || settingsMap["terms_and_conditions"] || "No terms configured.";

  const htmlContent = generateQuotationHtml({
    quotation,
    services: services ?? [],
    events: (events ?? []) as unknown as Event[],
    deliverables: deliverables ?? [],
    terms,
    settings: settingsMap,
  });

  const pdf = await compileHtmlToPdf(htmlContent, "quotations.pdf");
  await setCachedPdfArtifact(cacheKey, quotation.updated_at, pdf);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quotation-${id.slice(0, 8)}.pdf"`,
    },
  });
}
