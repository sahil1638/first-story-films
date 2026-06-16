import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { AdminNotes } from "@/components/ui/admin-notes";
import { formatDate } from "@/lib/utils";
import { LeadActions } from "@/components/leads/lead-actions";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { getLeadById } from "@/lib/data/leads";
import { getEvents, getServices, getDeliverables } from "@/lib/data/masters";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Building2,
  Wallet,
  Globe,
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

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let lead: Awaited<ReturnType<typeof getLeadById>> | null = null;
  try {
    lead = await getLeadById(id);
  } catch {
    notFound();
  }
  if (!lead) notFound();

  const [events, services, deliverables] = await Promise.all([
    getEvents(),
    getServices(),
    getDeliverables(),
  ]);

  const eventMap = new Map((events ?? []).map((e) => [e.id, e.name]));
  const serviceMap = new Map((services ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-4">
      {/* Premium Custom Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-3">
          <Tooltip content="Back" position="right">
            <Link
              href="/leads"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Tooltip>
          <h1 className="text-2xl font-bold text-stone-900 leading-none">{lead.couple_name}</h1>
        </div>
        <LeadActions lead={lead} services={services ?? []} deliverables={deliverables ?? []} events={events ?? []} />
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
                value={formatDate(lead.wedding_date)}
              />
              <RowWithIcon
                icon={MapPin}
                label="Event Location"
                value={lead.event_location}
              />
              <RowWithIcon
                icon={Building2}
                label="Wedding Venue"
                value={lead.wedding_venue ?? "—"}
              />
              <RowWithIcon
                icon={Wallet}
                label="Budget"
                value={lead.budget_range}
              />
              <RowWithIcon
                icon={Globe}
                label="Source"
                value={lead.source.replace(/_/g, " ")}
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
                value={lead.your_name || lead.couple_name}
              />
              <RowWithIcon
                icon={Phone}
                label="Contact"
                value={lead.contact_number}
              />
              <RowWithIcon
                icon={Mail}
                label="Email"
                value={lead.email ?? "—"}
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
                value={lead.album_requirement}
              />
              <RowWithIcon
                icon={Compass}
                label="Drone"
                value={lead.drone_requirement}
              />
              <RowWithIcon
                icon={Camera}
                label="Shooting Side"
                value={lead.shooting_side}
              />
              <RowWithIcon
                icon={Users}
                label="Pre-Wedding"
                value={lead.pre_wedding_shoot}
              />
              <RowWithIcon
                icon={Sparkles}
                label="Functions"
                value={String(lead.functions_count)}
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
            (lead.lead_function_days ?? []).length === 1
              ? "grid grid-cols-1 gap-3"
              : (lead.lead_function_days ?? []).length === 2
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {(lead.lead_function_days ?? []).map((day: {
            id: string;
            day_index: number;
            day_date: string;
            first_event_id: string | null;
            second_event_id: string | null;
            lead_function_day_services?: { service_id: string }[];
          }) => (
            <div key={day.id} className="rounded-xl border border-stone-200 p-3 text-sm bg-stone-50/50">
              <p className="font-semibold text-stone-900 mb-1">Day {day.day_index} — {formatDate(day.day_date)}</p>
              <p className="text-stone-600">
                <span className="font-medium text-stone-500">Events:</span> {eventMap.get(day.first_event_id ?? "") ?? "—"}
                {day.second_event_id ? `, ${eventMap.get(day.second_event_id)}` : ""}
              </p>
              <p className="text-stone-600 mt-0.5">
                <span className="font-medium text-stone-500">Services:</span>{" "}
                {(day.lead_function_day_services ?? [])
                  .map((s) => serviceMap.get(s.service_id))
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
            </div>
          ))}
          {(lead.lead_function_days ?? []).length === 0 && (
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
          {lead.additional_details ? (
            <p className="text-sm text-stone-600 leading-relaxed font-medium bg-stone-50/50 p-3 rounded-xl">{lead.additional_details}</p>
          ) : (
            <p className="py-3 text-stone-500 italic text-center w-full my-2">No additional information specified.</p>
          )}
        </Card>

        {/* Admin Notes */}
        <AdminNotes
          recordId={lead.id}
          table="leads"
          initialNotes={lead.admin_notes}
        />
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
