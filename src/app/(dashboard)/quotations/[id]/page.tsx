import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { Card } from "@/components/ui/card";
import { AdminNotes } from "@/components/ui/admin-notes";
import { formatDate } from "@/lib/utils";
import { QuotationActions } from "@/components/quotations/quotation-actions";
import { ServicePersonCounts } from "@/components/quotations/service-person-counts";
import { DeliverablesSelection } from "@/components/quotations/deliverables-selection";
import { QuotationTermsCard } from "@/components/quotations/quotation-terms-card";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { PdfDownloadButton } from "@/components/ui/pdf-download-button";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Building2,
  Wallet,
  User,
  Phone,
  Mail,
  Image as ImageIcon,
  Compass,
  Camera,
  Sparkles,
  Users,
  Info,
  ClipboardList,
  ClipboardCheck,
} from "lucide-react";

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();

  const { data: quotation } = await supabase
    .from("quotations")
    .select(
      "*, quotation_service_persons(*), quotation_deliverables(deliverable_id), quotation_function_days(*, quotation_function_day_services(service_id))"
    )
    .eq("id", id)
    .single();

  if (!quotation) notFound();

  const [
    { data: deliverables },
    { data: services },
    { data: events },
    { data: termsRow },
  ] = await Promise.all([
    supabase.from("deliverables").select("*").eq("status", "active"),
    supabase.from("services").select("*").eq("status", "active"),
    supabase.from("events").select("id, name"),
    supabase.from("settings").select("value").eq("key", "terms_and_conditions").maybeSingle(),
  ]);

  const eventMap = new Map((events ?? []).map((e) => [e.id, e.name]));
  const serviceMap = new Map((services ?? []).map((s) => [s.id, s.name]));

  const selectedDeliverables = (quotation.quotation_deliverables ?? []).map(
    (d: { deliverable_id: string }) => d.deliverable_id
  );
  const selectedServiceIds = new Set<string>();
  for (const day of quotation.quotation_function_days ?? []) {
    for (const service of day.quotation_function_day_services ?? []) {
      selectedServiceIds.add(service.service_id);
    }
  }
  const selectedServices = (services ?? []).filter((service) => selectedServiceIds.has(service.id));
  const servicePersons = (quotation.quotation_service_persons ?? []) as {
    service_id: string;
    person_count: number;
  }[];

  return (
    <div className="space-y-4">
      {/* Premium Custom Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-3">
          <Tooltip content="Back" position="right">
            <Link
              href="/quotations"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Tooltip>
          <div>
            <span className="text-3xs uppercase tracking-wider font-bold text-stone-400">QUOTATION</span>
            <h1 className="text-2xl font-bold text-stone-900 leading-none mt-0.5">{quotation.couple_name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QuotationActions
            quotation={quotation}
            services={selectedServices}
            deliverables={(deliverables ?? []).map((deliverable) => ({
              id: deliverable.id,
              title: deliverable.title,
            }))}
            initialDeliverables={selectedDeliverables}
          />
          <PdfDownloadButton
            url={`/api/quotations/${id}/pdf`}
            filename={`quotation-${id.slice(0, 8)}.pdf`}
            tooltip="Download PDF"
          />
        </div>
      </div>

      {/* 3-Column Top Grid */}
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
                value={formatDate(quotation.wedding_date)}
              />
              <RowWithIcon
                icon={MapPin}
                label="Event Location"
                value={quotation.event_location}
              />
              <RowWithIcon
                icon={Building2}
                label="Wedding Venue"
                value={quotation.wedding_venue ?? "—"}
              />
              <RowWithIcon
                icon={Wallet}
                label="Budget"
                value={quotation.budget_range}
              />
              <RowWithIcon
                icon={Wallet}
                label="Quotation Amount"
                value={quotation.amount ? `Rs. ${quotation.amount.toLocaleString()}` : "Dynamic Package Price"}
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
                value={quotation.your_name || quotation.couple_name}
              />
              <RowWithIcon
                icon={Phone}
                label="Contact"
                value={quotation.contact_number}
              />
              <RowWithIcon
                icon={Mail}
                label="Email"
                value={quotation.email ?? "—"}
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
                value={quotation.album_requirement}
              />
              <RowWithIcon
                icon={Compass}
                label="Drone"
                value={quotation.drone_requirement}
              />
              <RowWithIcon
                icon={Camera}
                label="Shooting Side"
                value={quotation.shooting_side}
              />
              <RowWithIcon
                icon={Users}
                label="Pre-Wedding"
                value={quotation.pre_wedding_shoot}
              />
              <RowWithIcon
                icon={Sparkles}
                label="Functions"
                value={String(quotation.functions_count)}
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
            (quotation.quotation_function_days ?? []).length === 1
              ? "grid grid-cols-1 gap-3"
              : (quotation.quotation_function_days ?? []).length === 2
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {(quotation.quotation_function_days ?? []).map((day: {
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
                  .map((s) => serviceMap.get(s.service_id))
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
          ))}
          {(quotation.quotation_function_days ?? []).length === 0 && (
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
          {quotation.additional_details ? (
            <p className="text-sm text-stone-600 leading-relaxed font-medium bg-stone-50/50 p-3 rounded-xl">{quotation.additional_details}</p>
          ) : (
            <div className="text-sm text-stone-600 leading-relaxed font-medium bg-stone-50/50 p-3 rounded-xl min-h-[60px] flex items-center justify-start">
              <p className="text-stone-400 italic text-center w-full py-2">
                No additional information specified.
              </p>
            </div>
          )}
        </Card>

        {/* Admin Notes */}
        <AdminNotes
          recordId={quotation.id}
          table="quotations"
          initialNotes={quotation.admin_notes}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Service-wise Person Count */}
        <Card className="!p-3">
          <ServicePersonCounts
            quotationId={id}
            services={selectedServices.map((service) => ({ id: service.id, name: service.name }))}
            servicePersons={servicePersons}
          />
        </Card>

        {/* Deliverables Selection */}
        <Card className="!p-3">
          <DeliverablesSelection
            quotationId={id}
            deliverables={(deliverables ?? []).map((deliverable) => ({
              id: deliverable.id,
              title: deliverable.title,
            }))}
            initialDeliverables={selectedDeliverables}
          />
        </Card>

        <Card className="!p-3">
          <QuotationTermsCard
            quotationId={id}
            initialTerms={quotation.terms_and_conditions ?? null}
            defaultTerms={termsRow?.value ?? ""}
          />
        </Card>
      </div>
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
