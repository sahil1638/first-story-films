import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { generateOrderAgreementHtml } from "@/lib/order-agreement-template";
import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";

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
  await requireRole(["admin", "manager", "sales"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      *,
      order_services(
        id,
        service_id,
        person_count,
        order_service_allocations(crew_member_id)
      ),
      order_deliverables(deliverable_id)
    `)
    .eq("id", id)
    .single();

  if (orderError && orderError.code !== "PGRST116") {
    console.error("Order agreement PDF order query failed", orderError);
    return Response.json({ error: "Unable to load order for PDF" }, { status: 500 });
  }
  if (!order) notFound();

  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .select(`
      *,
      quotation_function_days(
        *,
        quotation_function_day_services(service_id)
      )
    `)
    .eq("id", order.quotation_id)
    .maybeSingle();

  if (quotationError) {
    console.error("Order agreement PDF quotation query failed", quotationError);
    return Response.json({ error: "Unable to load quotation details for PDF" }, { status: 500 });
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
    { data: services },
    { data: deliverables },
    { data: events },
    { data: crew },
    { data: payments },
    { data: settingsRows },
  ] = await Promise.all([
    supabase.from("services").select("id, name"),
    selectedDeliverableIds.length > 0
      ? supabase.from("deliverables").select("id, title").in("id", selectedDeliverableIds)
      : Promise.resolve({ data: [] }),
    supabase.from("events").select("id, name"),
    supabase.from("crew_members").select("id, name, crew_member_services(service_id)"),
    supabase
      .from("payments")
      .select("amount, payment_date, receipt_number, notes")
      .eq("order_id", id)
      .order("payment_date", { ascending: true }),
    supabase.from("settings").select("key, value"),
  ]);

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

  const pdf = await compileHtmlToPdf(htmlContent);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="wedding-order-agreement-${id.slice(0, 8)}.pdf"`,
    },
  });
}
