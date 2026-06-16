import { notFound } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { getOrderById } from "@/lib/data/orders";
import { getSettingByKey, getServicesByIds } from "@/lib/data/masters";

export default async function OrderAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order;
  let agreementVal = "";
  try {
    const [o, a] = await Promise.all([
      getOrderById(id),
      getSettingByKey("agreement_content"),
    ]);
    order = o;
    agreementVal = a ?? "";
  } catch {
    notFound();
  }

  if (!order) notFound();

  const orderServiceIds = (order.order_services ?? []).map((service: { service_id: string }) => service.service_id);
  let services: Awaited<ReturnType<typeof getServicesByIds>> = [];
  if (orderServiceIds.length > 0) {
    try {
      services = await getServicesByIds(orderServiceIds);
    } catch (e) {
      console.error("Failed to fetch services for agreement page", e);
    }
  }
  const agreement = order.agreement_content?.trim() || agreementVal;
  const invoiceType = order.invoice_type === "gst" ? "GST" : "Non-GST";
  const subtotal = Number(order.subtotal_amount ?? order.total_amount ?? 0);
  const gstAmount = Number(order.gst_amount ?? 0);
  const total = Number(order.total_amount ?? 0);
  const paid = Number(order.paid_amount ?? 0);

  return (
    <div className="mx-auto max-w-4xl bg-white text-stone-900">
      <div className="no-print mb-6 flex flex-wrap gap-3">
        <Link href={`/orders/${id}`}>
          <Button variant="outline" type="button" tooltip="Back">
            Back to order
          </Button>
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6 rounded-xl border border-stone-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">First Story Films</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">Order Payment Agreement</h1>
            <p className="mt-1 text-lg font-semibold text-stone-800">{order.couple_name}</p>
          </div>
          <div className="text-right text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Order #{id.slice(0, 8).toUpperCase()}</p>
            <p>Wedding Date: {formatDate(order.wedding_date)}</p>
            <p>Status: {String(order.payment_status).replace(/_/g, " ").toUpperCase()}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Customer</p>
          <p className="mt-2 font-semibold text-stone-900">{order.your_name || order.couple_name}</p>
          <p className="text-stone-600">{order.contact_number}</p>
          {order.email && <p className="text-stone-600">{order.email}</p>}
        </div>
        <div className="rounded-lg border border-stone-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Event</p>
          <p className="mt-2 font-semibold text-stone-900">{order.event_location}</p>
          <p className="text-stone-600">Venue: {order.wedding_venue || "-"}</p>
          <p className="text-stone-600">Budget: {order.budget_range || "-"}</p>
        </div>
      </section>

      <section className="mb-6 grid gap-4 text-sm sm:grid-cols-4">
        <SummaryBox label="Bill Type" value={invoiceType} />
        <SummaryBox label="Base Amount" value={formatCurrency(subtotal)} />
        <SummaryBox label="GST" value={invoiceType === "GST" ? formatCurrency(gstAmount) : "-"} />
        <SummaryBox label="Final Amount" value={formatCurrency(total)} strong />
        <SummaryBox label="Paid" value={formatCurrency(paid)} />
        <SummaryBox label="Remaining" value={formatCurrency(Math.max(0, total - paid))} />
      </section>

      <section className="space-y-6 text-sm leading-relaxed text-stone-800">
        <div>
          <h2 className="mb-3 border-b border-stone-200 pb-2 text-base font-bold uppercase tracking-wide">
            Booked Services
          </h2>
          {(services ?? []).length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(services ?? []).map((service) => (
                <li key={service.id} className="rounded border border-stone-200 px-3 py-2">
                  {service.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone-500">No services attached to this order.</p>
          )}
        </div>

        <div>
          <h2 className="mb-3 border-b border-stone-200 pb-2 text-base font-bold uppercase tracking-wide">
            Agreement
          </h2>
          {agreement ? (
            <div className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-4">
              {agreement}
            </div>
          ) : (
            <p className="text-stone-500">
              No agreement text yet. Add it under Settings - Agreement Content.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className={strong ? "mt-2 text-lg font-bold text-stone-900" : "mt-2 font-semibold text-stone-900"}>
        {value}
      </p>
    </div>
  );
}
