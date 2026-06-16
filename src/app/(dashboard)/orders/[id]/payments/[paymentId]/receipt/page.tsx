import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrderById, getPaymentsByOrderId } from "@/lib/data/orders";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;

  let order;
  let allPayments;
  try {
    [order, allPayments] = await Promise.all([
      getOrderById(id),
      getPaymentsByOrderId(id),
    ]);
  } catch {
    notFound();
  }

  if (!order) notFound();

  const payment = (allPayments ?? []).find((p) => p.id === paymentId);
  if (!payment) notFound();

  return (
    <div className="mx-auto max-w-3xl bg-white text-stone-900">
      <div className="no-print mb-6 flex flex-wrap gap-3">
        <Link href={`/orders/${id}`}>
          <Button variant="outline" type="button" tooltip="Back">
            Back to order
          </Button>
        </Link>
        <PrintButton />
      </div>

      <header className="mb-6 rounded-xl border border-stone-200 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">First Story Films</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Payment Receipt</h1>
        <div className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
          <p><span className="font-semibold text-stone-900">Receipt:</span> {payment.receipt_number}</p>
          <p><span className="font-semibold text-stone-900">Date:</span> {formatDate(payment.payment_date)}</p>
        </div>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Received From</p>
          <p className="mt-2 font-semibold text-stone-900">{order.your_name || order.couple_name}</p>
          <p className="text-sm text-stone-600">{order.contact_number}</p>
          {order.email && <p className="text-sm text-stone-600">{order.email}</p>}
        </div>
        <div className="rounded border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Order</p>
          <p className="mt-2 font-semibold text-stone-900">{order.couple_name}</p>
          <p className="text-sm text-stone-600">{formatDate(order.wedding_date)} - {order.event_location}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200">
        <div className="flex justify-between border-b border-stone-200 px-4 py-3 text-sm">
          <span className="font-medium text-stone-600">Payment Amount</span>
          <span className="font-bold text-stone-900">{formatCurrency(Number(payment.amount))}</span>
        </div>
        <div className="flex justify-between border-b border-stone-200 px-4 py-3 text-sm">
          <span className="font-medium text-stone-600">Receipt Number</span>
          <span className="font-semibold text-stone-900">{payment.receipt_number}</span>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <span className="font-medium text-stone-600">Payment Date</span>
          <span className="font-semibold text-stone-900">{formatDate(payment.payment_date)}</span>
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-stone-500">
        This receipt confirms payment received against the above order.
      </p>
    </div>
  );
}
