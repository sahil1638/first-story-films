import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";
import { generateOrderAgreementHtml } from "@/lib/order-agreement-template";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";
import { getOrderById, getPaymentsByOrderId } from "@/lib/data/orders";
import { getQuotationById } from "@/lib/data/quotations";
import { getServices, getDeliverablesByIds, getEvents, getCrewMembers, getSettings } from "@/lib/data/masters";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { handleApiError } from "@/lib/security/api-errors";
import { getCachedPdfArtifact, setCachedPdfArtifact } from "@/lib/pdf-cache";

type OrderService = {
  id: string;
  service_id: string;
  person_count: number;
  order_service_allocations?: { crew_member_id: string }[] | null;
};

type OrderDeliverable = {
  deliverable_id: string;
};

type QuotationFunctionDay = {
  day_index: number;
  day_date: string;
  first_event_id: string | null;
  second_event_id: string | null;
  quotation_function_day_services?: { service_id: string }[] | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let profile;
  try {
    profile = await requireRoleOrThrow(["admin", "manager", "sales"]);
  } catch (error) {
    return handleApiError(error, { context: "orders.pdf" });
  }

  const { id } = await params;
  const supabase = await createClient();

  // Perform lightweight metadata query first
  const { data: orderMeta, error: metaError } = await supabase
    .from("orders")
    .select("updated_at")
    .eq("id", id)
    .single();

  if (metaError || !orderMeta) notFound();

  // 1. Per-user rate limit: max 5 requests, refilling 1 token every 5 seconds (0.2/sec) (cheap check before cache)
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userKey = profile ? `user:${profile.id}` : `ip:${ip}`;
  const allowed = await checkDbRateLimit(rateLimitKey("pdf", userKey), {
    maxTokens: 5,
    refillRatePerSec: 0.2,
    cost: 1.0,
    context: "orders.pdf",
  });
  if (!allowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

  // 2. Cache check
  const cacheKey = `order:${id}`;
  const cached = await getCachedPdfArtifact(cacheKey, orderMeta.updated_at);
  if (cached) {
    return new Response(new Uint8Array(cached), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="wedding-order-agreement-${id.slice(0, 8)}.pdf"`,
      },
    });
  }

  // 3. Per-route rate limit (expensive rendering check only on cache miss)
  const routeAllowed = await checkDbRateLimit(rateLimitKey("pdf-route", "orders"), {
    maxTokens: 10,
    refillRatePerSec: 0.5,
    cost: 1.0,
    context: "orders.pdf.route",
  });
  if (!routeAllowed) {
    return new Response("Too many PDF requests. Please try again later.", { status: 429 });
  }

  let order;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  let quotation = null;
  if (order.quotation_id) {
    try {
      quotation = await getQuotationById(order.quotation_id);
    } catch (e) {
      console.error("Order agreement PDF quotation query failed", e);
    }
  }

  const functionDays = (quotation?.quotation_function_days ?? []) as QuotationFunctionDay[];
  const selectedServiceIds = new Set<string>();

  for (const day of functionDays) {
    for (const service of day.quotation_function_day_services ?? []) {
      selectedServiceIds.add(service.service_id);
    }
  }
  for (const orderService of (order.order_services ?? []) as OrderService[]) {
    selectedServiceIds.add(orderService.service_id);
  }

  const selectedDeliverableIds = ((order.order_deliverables ?? []) as OrderDeliverable[])
    .map((deliverable) => deliverable.deliverable_id)
    .filter(Boolean);

  const [
    services,
    deliverables,
    events,
    crew,
    paymentsRaw,
    settingsRows,
  ] = await Promise.all([
    getServices(),
    getDeliverablesByIds(selectedDeliverableIds),
    getEvents(),
    getCrewMembers(),
    getPaymentsByOrderId(id),
    getSettings(),
  ]);

  // Sort payments by date ascending for PDF display
  const payments = [...(paymentsRaw ?? [])].sort(
    (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  );

  const serviceMap = new Map((services ?? []).map((service) => [service.id, service.name]));
  const bookedServices = (services ?? []).filter((service) => selectedServiceIds.has(service.id));
  const eventMap = new Map((events ?? []).map((event) => [event.id, event.name]));
  const settings = Object.fromEntries(
    (settingsRows ?? []).map((row) => [row.key, row.value ?? ""])
  );

  const htmlContent = generateOrderAgreementHtml({
    order,
    quotation,
    services: bookedServices,
    deliverables: deliverables ?? [],
    functionDays,
    payments: payments ?? [],
    crew: crew ?? [],
    settings,
    serviceMap,
    eventMap,
  });

  const pdf = await compileHtmlToPdf(htmlContent, "orders.pdf");
  await setCachedPdfArtifact(cacheKey, order.updated_at, pdf);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wedding-order-agreement-${id.slice(0, 8)}.pdf"`,
    },
  });
}
