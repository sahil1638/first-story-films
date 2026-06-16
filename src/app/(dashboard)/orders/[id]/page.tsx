import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/data/users";
import { Card } from "@/components/ui/card";
import { AdminNotes } from "@/components/ui/admin-notes";
import { formatDate, formatCurrency } from "@/lib/utils";
import { OrderProduction } from "@/components/orders/order-production";
import { OrderPayments } from "@/components/orders/order-payments";
import { OrderCrewAllocation } from "@/components/orders/order-crew-allocation";
import { OrderAgreementContent } from "@/components/orders/order-agreement-content";
import { OrderEditButton } from "@/components/orders/order-edit-button";
import { OrderStatusSelect } from "@/components/orders/order-status-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { PdfDownloadButton } from "@/components/ui/pdf-download-button";
import { getOrderById, getProductionJobsByOrderId, getPaymentsByOrderId } from "@/lib/data/orders";
import { getQuotationById } from "@/lib/data/quotations";
import { getAgencies, getServices, getCrewMembers, getEvents, getSettingByKey } from "@/lib/data/masters";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Building2,
  Wallet,
  User,
  Phone,
  Mail,
  ClipboardList,
  ClipboardCheck,
  Image as ImageIcon,
  Compass,
  Camera,
  Sparkles,
  Users,
  Info,
} from "lucide-react";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let order: Awaited<ReturnType<typeof getOrderById>> | null = null;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  const profile = await getCurrentUserProfile();
  const userRole = profile?.role ?? "sales";

  const invoiceType = order.invoice_type ?? "non_gst";
  const subtotalAmount = Number(order.subtotal_amount ?? order.total_amount ?? 0);
  const gstAmount = Number(order.gst_amount ?? 0);
  const remainingAmount = Math.max(0, Number(order.total_amount ?? 0) - Number(order.paid_amount ?? 0));

  const [
    allAgencies,
    services,
    allCrew,
    jobs,
    payments,
    quotation,
    events,
    agreementVal,
  ] = await Promise.all([
    getAgencies(),
    getServices(),
    getCrewMembers(),
    getProductionJobsByOrderId(id),
    getPaymentsByOrderId(id),
    order.quotation_id ? getQuotationById(order.quotation_id) : Promise.resolve(null),
    getEvents(),
    getSettingByKey("agreement_content"),
  ]);

  const agencies = allAgencies.filter((a) => a.status === "active");
  const crew = allCrew.filter((c) => c.status === "active");

  const eventMap = new Map((events ?? []).map((event) => [event.id, event.name]));
  const serviceMap = new Map((services ?? []).map((service) => [service.id, service.name]));
  const functionDays = quotation?.quotation_function_days ?? [];

  return (
    <div className="space-y-4">
      {/* Premium Custom Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-3">
          <Tooltip content="Back" position="right">
            <Link
              href="/orders"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Tooltip>
          <div>
            <span className="text-3xs uppercase tracking-wider font-bold text-stone-400">ORDER BOOKING</span>
            <h1 className="text-2xl font-bold text-stone-900 leading-none mt-0.5">{order.couple_name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <OrderStatusSelect orderId={id} status={order.status} />
          <Badge
            variant={order.payment_status === "paid" ? "success" : "warning"}
            className="!px-2.5 !py-0.5 text-xs font-bold leading-5"
          >
            {order.payment_status.replace(/_/g, " ").toUpperCase()}
          </Badge>
          <OrderEditButton order={order} />
          <PdfDownloadButton
            url={`/api/orders/${id}/pdf`}
            filename={`order-${id.slice(0, 8)}.pdf`}
            tooltip="Download PDF"
          />
        </div>
      </div>

      {/* Orders Dynamic Financial Stats Row */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex min-h-0 items-center justify-between border-l-4 border-l-blue-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Bill Type</p>
            <p className="mt-0.5 text-lg font-bold text-stone-900 tabular-nums">
              {invoiceType === "gst" ? "GST" : "Non-GST"}
            </p>
            <p className="mt-0.5 text-xs font-medium text-stone-500">
              Base {formatCurrency(subtotalAmount)}
              {invoiceType === "gst" ? ` + GST ${formatCurrency(gstAmount)}` : ""}
            </p>
          </div>
        </Card>
        <Card className="flex min-h-0 items-center justify-between border-l-4 border-l-stone-800 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Final Booked Amount</p>
            <p className="mt-0.5 text-lg font-bold text-stone-900 tabular-nums">
              {formatCurrency(Number(order.total_amount))}
            </p>
          </div>
        </Card>
        <Card className="flex min-h-0 items-center justify-between border-l-4 border-l-emerald-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Total Amount Paid</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700 tabular-nums">
              {formatCurrency(Number(order.paid_amount))}
            </p>
          </div>
        </Card>
        <Card className="flex min-h-0 items-center justify-between border-l-4 border-l-amber-600 !p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Remaining</p>
            <p className="mt-0.5 text-lg font-bold text-amber-700 tabular-nums">
              {formatCurrency(remainingAmount)}
            </p>
          </div>
        </Card>
      </div>

      {/* 3-Column Top Detail Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Column 1: Basic Details */}
        <Card className="flex flex-col justify-between !p-3">
          <div>
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <ClipboardList className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-stone-900">Basic Details</h3>
            </div>
            <div className="space-y-1">
              <RowWithIcon
                icon={Calendar}
                label="Wedding Date"
                value={formatDate(order.wedding_date)}
              />
              <RowWithIcon
                icon={MapPin}
                label="Event Location"
                value={order.event_location}
              />
              <RowWithIcon
                icon={Building2}
                label="Wedding Venue"
                value={order.wedding_venue ?? "—"}
              />
              <RowWithIcon
                icon={Wallet}
                label="Budget"
                value={order.budget_range ?? "—"}
              />
            </div>
          </div>
        </Card>

        {/* Column 2: Contact Information */}
        <Card className="flex flex-col justify-between !p-3">
          <div>
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Phone className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-stone-900">Contact Information</h3>
            </div>
            <div className="space-y-1">
              <RowWithIcon
                icon={User}
                label="Name"
                value={order.your_name || order.couple_name}
              />
              <RowWithIcon
                icon={Phone}
                label="Contact"
                value={order.contact_number}
              />
              <RowWithIcon
                icon={Mail}
                label="Email"
                value={order.email ?? "—"}
              />
            </div>
          </div>
        </Card>

        {/* Column 3: Requirements */}
        <Card className="flex flex-col justify-between !p-3">
          <div>
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-stone-900">Requirements</h3>
            </div>
            <div className="space-y-1">
              <RowWithIcon
                icon={ImageIcon}
                label="Album"
                value={quotation?.album_requirement ?? "—"}
              />
              <RowWithIcon
                icon={Compass}
                label="Drone"
                value={quotation?.drone_requirement ?? "—"}
              />
              <RowWithIcon
                icon={Camera}
                label="Shooting Side"
                value={quotation?.shooting_side ?? "—"}
              />
              <RowWithIcon
                icon={Users}
                label="Pre-Wedding"
                value={quotation?.pre_wedding_shoot ?? "—"}
              />
              <RowWithIcon
                icon={Sparkles}
                label="Functions"
                value={String(quotation?.functions_count ?? "—")}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Function Days */}
      <Card className="!p-3">
        <div className="flex items-center gap-2.5 border-b border-stone-100 pb-2 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <Calendar className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Function Days</h3>
        </div>
        <div
          className={
            functionDays.length === 1
              ? "grid grid-cols-1 gap-3"
              : functionDays.length === 2
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {functionDays.map((day: {
            id: string;
            day_index: number;
            day_date: string;
            first_event_id: string | null;
            second_event_id: string | null;
            quotation_function_day_services?: { service_id: string }[];
          }) => (
            <div key={day.id} className="rounded-xl border border-stone-200 p-3 text-sm bg-stone-50/50">
              <p className="font-semibold text-stone-900 mb-1">Day {day.day_index} — {formatDate(day.day_date)}</p>
              <p className="text-stone-600">
                <span className="font-medium text-stone-500">Events:</span> {eventMap.get(day.first_event_id ?? "") ?? "—"}
                {day.second_event_id ? `, ${eventMap.get(day.second_event_id)}` : ""}
              </p>
              <p className="text-stone-600 mt-0.5">
                <span className="font-medium text-stone-500">Services:</span>{" "}
                {(day.quotation_function_day_services ?? [])
                  .map((service) => serviceMap.get(service.service_id))
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
          ))}
          {functionDays.length === 0 && (
            <p className="py-3 text-center text-stone-500">No function days specified.</p>
          )}
        </div>
      </Card>

      {/* Additional Information & Notes from Admin Grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Additional Information */}
        <Card className="!p-3 h-full">
          <div className="flex items-center gap-2.5 border-b border-stone-100 pb-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Info className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-base text-stone-900">Additional Information</h3>
          </div>
          {quotation?.additional_details ? (
            <p className="text-sm text-stone-600 leading-relaxed font-medium bg-stone-50/50 p-3 rounded-xl">
              {quotation.additional_details}
            </p>
          ) : (
            <p className="py-3 text-stone-500 italic text-center w-full my-2">No additional information specified.</p>
          )}
        </Card>

        {/* Admin Notes */}
        <AdminNotes
          recordId={order.id}
          table="orders"
          initialNotes={order.admin_notes}
        />
      </div>

      {userRole === "sales" ? (
        <div className="grid items-stretch gap-3 xl:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3">
            <OrderCrewAllocation
              orderId={id}
              orderServices={order.order_services ?? []}
              crew={crew ?? []}
              services={services ?? []}
            />

            <OrderPayments
              orderId={id}
              payments={payments ?? []}
              totalAmount={Number(order.total_amount)}
              paidAmount={Number(order.paid_amount)}
            />
          </div>

          <Card className="!p-3 h-full">
            <OrderAgreementContent
              orderId={id}
              initialContent={order.agreement_content ?? null}
              defaultContent={agreementVal ?? ""}
            />
          </Card>
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-2">
            <OrderCrewAllocation
              orderId={id}
              orderServices={order.order_services ?? []}
              crew={crew ?? []}
              services={services ?? []}
            />

            <Card className="!p-3">
              <OrderAgreementContent
                orderId={id}
                initialContent={order.agreement_content ?? null}
                defaultContent={agreementVal ?? ""}
              />
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <OrderPayments
              orderId={id}
              payments={payments ?? []}
              totalAmount={Number(order.total_amount)}
              paidAmount={Number(order.paid_amount)}
            />

            <OrderProduction
              orderId={id}
              orderServices={order.order_services ?? []}
              agencies={agencies ?? []}
              services={services ?? []}
              jobs={jobs ?? []}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RowWithIcon({
  icon: Icon,
  label,
  value,
  iconBgClass = "bg-stone-50 text-stone-500",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  iconBgClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-stone-100 last:border-0">
      <div className="flex min-w-[150px] items-center gap-3">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconBgClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-medium text-stone-500 text-sm">{label}</span>
      </div>
      <span className="min-w-0 flex-1 text-right font-semibold text-stone-900 text-sm whitespace-normal break-words" title={value}>
        {value}
      </span>
    </div>
  );
}
