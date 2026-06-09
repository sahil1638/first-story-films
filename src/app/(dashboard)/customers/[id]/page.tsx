import Link from "next/link";
import { ClickableRow } from "@/components/ui/clickable-row";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  CreditCard,
  Heart,
  Mail,
  Phone,
} from "lucide-react";

type Customer = {
  id: string;
  couple_name: string;
  contact_number: string;
  email: string | null;
  created_at: string;
};

type OrderService = {
  id: string;
  person_count: number;
  services: { name: string } | null;
};

type CustomerOrder = {
  id: string;
  couple_name: string;
  your_name: string;
  contact_number: string;
  email: string | null;
  event_location: string;
  wedding_date: string;
  wedding_venue: string | null;
  budget_range: string | null;
  invoice_type: "gst" | "non_gst" | null;
  subtotal_amount: number | null;
  gst_amount: number | null;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  status: string;
  created_at: string;
  order_services?: OrderService[];
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManagerOrAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, couple_name, contact_number, email, created_at")
    .eq("id", id)
    .single();

  if (!customer) notFound();

  const typedCustomer = customer as Customer;
  const { data: orders } = await supabase
    .from("orders")
    .select("*, order_services(id, person_count, services(name))")
    .eq("contact_number", typedCustomer.contact_number)
    .order("created_at", { ascending: false });

  const customerOrders = (orders ?? []) as CustomerOrder[];
  const primaryOrder = customerOrders[0];
  const customerName = primaryOrder?.your_name || typedCustomer.couple_name;
  const customerEmail = primaryOrder?.email || typedCustomer.email;
  const totalBooked = customerOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const totalPaid = customerOrders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0);
  const totalRemaining = Math.max(0, totalBooked - totalPaid);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-3">
          <Tooltip content="Back" position="right">
            <Link
              href="/customers"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Tooltip>
          <div>
            <span className="text-3xs uppercase tracking-wider font-bold text-stone-400">CUSTOMER</span>
            <h1 className="text-2xl font-bold text-stone-900 leading-none mt-0.5">{customerName}</h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm font-medium text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-stone-400" />
            {typedCustomer.contact_number}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-stone-400" />
            {customerEmail ?? "-"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center justify-between border-l-4 border-l-stone-800 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Total Orders</p>
            <p className="mt-0.5 text-lg font-bold text-stone-900 tabular-nums">{customerOrders.length}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between border-l-4 border-l-amber-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Total Booked</p>
            <p className="mt-0.5 text-lg font-bold text-stone-900 tabular-nums">{formatCurrency(totalBooked)}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between border-l-4 border-l-emerald-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Total Paid</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700 tabular-nums">{formatCurrency(totalPaid)}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between border-l-4 border-l-amber-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Remaining</p>
            <p className="mt-0.5 text-lg font-bold text-amber-700 tabular-nums">{formatCurrency(totalRemaining)}</p>
          </div>
        </Card>
      </div>

      <Card className="!p-3">
        <div className="mb-2 flex items-center gap-2.5 border-b border-stone-100 pb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
            <Heart className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Order History</h3>
        </div>

        <div className="-mx-3 overflow-x-auto border-t border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
              <tr>
                <th>Couple</th>
                <th>Wedding Date</th>
                <th>Location</th>
                <th>Bill Type</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {customerOrders.map((order) => {
                const remaining = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
                return (
                  <ClickableRow key={order.id} href={`/orders/${order.id}`} className="hover:bg-stone-50/50 group">
                    <td>
                      <span className="font-medium text-amber-700">
                        {order.couple_name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-stone-600">{formatDate(order.wedding_date)}</td>
                    <td className="text-stone-600">{order.event_location}</td>
                    <td className="whitespace-nowrap text-stone-600">{order.invoice_type === "gst" ? "GST" : "Non-GST"}</td>
                    <td className="whitespace-nowrap font-medium text-stone-900">{formatCurrency(Number(order.total_amount || 0))}</td>
                    <td className="whitespace-nowrap font-medium text-emerald-700">{formatCurrency(Number(order.paid_amount || 0))}</td>
                    <td className="whitespace-nowrap font-medium text-amber-700">{formatCurrency(remaining)}</td>
                    <td>
                      <Badge variant={order.payment_status === "paid" ? "success" : "warning"}>
                        {order.payment_status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={order.status === "complete" ? "success" : order.status === "cancelled" ? "danger" : "warning"}>
                        {order.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
          {customerOrders.length === 0 && (
            <p className="py-4 text-center text-stone-500">No orders found for this customer.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
