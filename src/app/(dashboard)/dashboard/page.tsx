import Link from "next/link";
import {
  CalendarDays,
  FileText,
  IndianRupee,
  ListChecks,
  MapPin,
  ShoppingBag,
  Users,
  WalletCards,
} from "lucide-react";
import { createClient, getProfile } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  couple_name: string;
  event_location: string | null;
  status: string;
  payment_status: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  wedding_date: string;
  created_at: string;
};

type AccountingEntryRow = {
  id: string;
  type: "income" | "expense";
  amount: number | string | null;
  entry_date: string;
  remarks: string | null;
  created_at: string;
};

type ProductionJobRow = {
  id: string;
  status: "pending" | "in_progress" | "done" | string;
  created_at: string;
  orders: { id: string; couple_name: string } | { id: string; couple_name: string }[] | null;
  services: { name: string } | { name: string }[] | null;
};

const MONTH_COUNT = 6;

export default async function DashboardPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const userRole = profile?.role ?? "sales";
  const canSeeProduction = userRole !== "sales";

  const [
    leadsCount,
    quotationsCount,
    ordersCount,
    ordersResult,
    accountingResult,
    productionResult,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("quotations").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id,couple_name,event_location,status,payment_status,total_amount,paid_amount,wedding_date,created_at")
      .order("wedding_date", { ascending: true }),
    supabase
      .from("accounting_entries")
      .select("id,type,amount,entry_date,remarks,created_at")
      .order("entry_date", { ascending: false }),
    supabase
      .from("production_jobs")
      .select("id,status,created_at,orders(id,couple_name),services(name)")
      .order("created_at", { ascending: false }),
  ]);

  const orders = (ordersResult.data ?? []) as OrderRow[];
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const accountingEntries = (accountingResult.data ?? []) as AccountingEntryRow[];
  const productionJobs = (productionResult.data ?? []) as ProductionJobRow[];

  const totalBookings = activeOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );
  const totalIncome = accountingEntries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalExpense = accountingEntries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const cashflowTrend = getCashflowTrend(accountingEntries);
  const maxCashflow = Math.max(
    ...cashflowTrend.map((month) => Math.max(month.income, month.expense)),
    1
  );

  const receivables = activeOrders
    .map((order) => {
      const total = Number(order.total_amount || 0);
      const paid = Number(order.paid_amount || 0);
      const outstanding = Math.max(0, total - paid);
      const paidPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
      return { ...order, total, paid, outstanding, paidPercent };
    })
    .filter((order) => order.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  const totalReceivable = receivables.reduce((sum, order) => sum + order.outstanding, 0);

  const upcomingShoots = activeOrders
    .filter((order) => isOnOrAfterToday(order.wedding_date))
    .slice(0, 5);

  const pipeline = [
    {
      label: "Pending",
      value: canSeeProduction ? productionJobs.filter((job) => job.status === "pending").length : activeOrders.filter((order) => order.status === "pending").length,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      label: "In Progress",
      value: canSeeProduction ? productionJobs.filter((job) => job.status === "in_progress").length : activeOrders.filter((order) => order.status === "convert_to_production").length,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    },
    {
      label: "Review",
      value: canSeeProduction ? 0 : activeOrders.filter((order) => order.payment_status === "partial_paid").length,
      className: "border-purple-200 bg-purple-50 text-purple-700",
    },
    {
      label: "Completed",
      value: canSeeProduction ? productionJobs.filter((job) => job.status === "done").length : activeOrders.filter((order) => order.status === "complete").length,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
  ];

  const stats = [
    {
      label: "Pending Leads",
      value: leadsCount.count ?? 0,
      icon: Users,
      href: "/leads",
      accent: "border-l-orange-500",
      iconClassName: "bg-orange-50 text-orange-600",
    },
    {
      label: "Quotations",
      value: quotationsCount.count ?? 0,
      icon: FileText,
      href: "/quotations",
      accent: "border-l-blue-500",
      iconClassName: "bg-blue-50 text-blue-600",
    },
    {
      label: "Orders",
      value: ordersCount.count ?? 0,
      icon: ShoppingBag,
      href: "/orders",
      accent: "border-l-emerald-500",
      iconClassName: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Total Bookings",
      value: formatCurrency(totalBookings),
      icon: IndianRupee,
      href: "/orders",
      accent: "border-l-indigo-500",
      iconClassName: "bg-indigo-50 text-indigo-600",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="border-b border-stone-200 pb-2">
        <h1 className="text-2xl font-semibold leading-none text-stone-950">Dashboard</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="block">
            <Card className={cn("min-h-[76px] border-l-4 !p-4 transition-shadow hover:shadow-md", stat.accent)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-normal uppercase tracking-wide text-stone-400">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold leading-none text-stone-950">{stat.value}</p>
                </div>
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", stat.iconClassName)}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-2 xl:items-stretch">
        <Card className="!p-3 xl:min-h-[220px]">
          <DashboardHeader
            icon={WalletCards}
            title="Cashflow Trend"
            iconClassName="bg-orange-50 text-orange-600"
            action={
              <div className="hidden items-center gap-4 text-sm font-normal text-stone-600 sm:flex">
                <LegendDot className="bg-emerald-600" label="Income" />
                <LegendDot className="bg-red-600" label="Expense" />
              </div>
            }
          />
          <div className="mt-2 grid gap-2 rounded-lg border border-stone-200 px-3 py-2 sm:grid-cols-2">
            <SummaryMetric label="Total Income" value={formatCurrency(totalIncome)} className="text-emerald-700" />
            <SummaryMetric label="Total Expense" value={formatCurrency(totalExpense)} className="text-red-700" />
          </div>
          <div className="mt-3 grid grid-cols-[24px_1fr] gap-2">
            <div className="flex h-40 flex-col justify-between pb-1 text-right text-xs font-medium text-stone-300">
              {getAxisLabels(maxCashflow).map((label, index) => (
                <span key={`axis-${index}`}>{label}</span>
              ))}
            </div>
            <div className="relative h-40">
              <div className="absolute inset-0 flex flex-col justify-between pb-1">
                {[0, 1, 2, 3, 4].map((line) => (
                  <span key={line} className="border-t border-dashed border-stone-100" />
                ))}
              </div>
              <div className="relative z-10 flex h-full items-end gap-4 px-2 pb-1">
                {cashflowTrend.map((month) => (
                  <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="flex flex-1 items-end justify-center gap-1.5">
                      <div
                        className="group relative w-full max-w-9 rounded-t-md bg-gradient-to-t from-emerald-400 to-emerald-600"
                        style={{ height: `${Math.max(1, (month.income / maxCashflow) * 100)}%` }}
                      >
                        <ChartTooltip value={formatCurrency(month.income)} className="bg-emerald-600" />
                      </div>
                      <div
                        className="group relative w-full max-w-9 rounded-t-md bg-gradient-to-t from-red-300 to-red-600"
                        style={{ height: `${Math.max(1, (month.expense / maxCashflow) * 100)}%` }}
                      >
                        <ChartTooltip value={formatCurrency(month.expense)} className="bg-red-600" />
                      </div>
                    </div>
                    <p className="mt-1 truncate text-center text-xs font-normal leading-3 text-stone-600">{month.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="!p-4 xl:min-h-[260px]">
          <DashboardHeader
            icon={IndianRupee}
            title="Outstanding Recievables"
            iconClassName="bg-emerald-50 text-emerald-700"
            action={<span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Total {formatCurrency(totalReceivable)}</span>}
          />
          <div className="mt-3 w-full overflow-hidden rounded-lg border border-stone-100">
            {receivables.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="grid grid-cols-[minmax(120px,0.7fr)_minmax(92px,0.45fr)_minmax(160px,1fr)_auto] items-center gap-4 border-t border-stone-100 px-3 py-2 transition-colors first:border-t-0 hover:bg-stone-50"
              >
                <span className="truncate text-sm font-semibold text-stone-950">{order.couple_name}</span>
                <span className="truncate text-xs font-normal uppercase tracking-wide text-stone-400">
                  {formatDate(order.created_at)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-normal uppercase text-stone-400">
                    Paid {formatCurrency(order.paid)} of {formatCurrency(order.total)}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <span
                        className={cn("block h-full rounded-full", order.paidPercent >= 50 ? "bg-emerald-600" : "bg-red-500")}
                        style={{ width: `${Math.max(4, order.paidPercent)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-xs font-normal text-stone-500">{order.paidPercent}%</span>
                  </span>
                </span>
                <span className="justify-self-end text-sm font-semibold text-stone-950">
                  {formatCurrency(order.outstanding)}
                </span>
              </Link>
            ))}
            {receivables.length === 0 && <EmptyState message="No outstanding receivables." />}
          </div>
        </Card>

        <Card className="!p-4 xl:min-h-[260px]">
          <DashboardHeader
            icon={CalendarDays}
            title="Upcoming Wedding Shoots"
            iconClassName="bg-orange-50 text-orange-600"
            action={<span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-normal text-stone-600">{upcomingShoots.length} Scheduled</span>}
          />
          <div className="mt-3 w-full overflow-hidden rounded-lg border border-stone-100">
            {upcomingShoots.map((order) => {
              const shootDate = new Date(`${order.wedding_date}T00:00:00`);

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="grid grid-cols-[40px_minmax(120px,1fr)_minmax(140px,1fr)_auto] items-center gap-4 border-t border-stone-100 px-3 py-2 transition-colors first:border-t-0 hover:bg-stone-50"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-orange-200 bg-orange-50">
                    <span className="text-[9px] font-semibold uppercase leading-none text-orange-600">
                      {shootDate.toLocaleDateString("en-IN", { month: "short" })}
                    </span>
                    <span className="mt-0.5 text-base font-semibold leading-none text-stone-950">{shootDate.getDate()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-950">{order.couple_name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0 text-stone-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <span className="truncate text-xs font-normal">{order.event_location || "Location not set"}</span>
                  </div>
                  <span className={cn("hidden rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase sm:inline-flex justify-self-end", order.status === "pending" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700")}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </Link>
              );
            })}
            {upcomingShoots.length === 0 && <EmptyState message="No upcoming shoots found." />}
          </div>
        </Card>

        <Card className="!p-4 xl:min-h-[260px]">
          <DashboardHeader
            icon={CalendarDays}
            title={canSeeProduction ? "Production Pipeline" : "Booking Pipeline"}
            iconClassName="bg-red-50 text-red-600"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {pipeline.map((item) => (
              <div key={item.label} className={cn("rounded-xl border p-3 text-center", item.className)}>
                <p className="text-[11px] font-semibold uppercase tracking-wide">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold leading-none">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <p className="text-xs font-normal uppercase tracking-wide text-stone-400">Recent Production Jobs</p>
            <div className="mt-1 w-full overflow-hidden rounded-lg border border-stone-100">
              {(canSeeProduction ? productionJobs.slice(0, 5) : []).map((job) => {
                const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
                const service = Array.isArray(job.services) ? job.services[0] : job.services;
                return (
                  <Link
                    key={job.id}
                    href={order?.id ? `/orders/${order.id}` : "/orders"}
                    className="grid grid-cols-[minmax(120px,0.65fr)_minmax(120px,1fr)_auto] items-center gap-4 border-t border-stone-100 px-3 py-2 transition-colors first:border-t-0 hover:bg-stone-50"
                  >
                    <span className="truncate text-sm font-semibold text-stone-950">{order?.couple_name ?? "Order"}</span>
                    <span className="truncate text-sm font-normal text-stone-500">{service?.name ?? "Service"}</span>
                    <span className={cn("justify-self-end rounded-full px-3 py-1 text-xs font-semibold uppercase", job.status === "done" ? "bg-emerald-50 text-emerald-700" : job.status === "in_progress" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700")}>
                      {job.status.replace(/_/g, " ")}
                    </span>
                  </Link>
                );
              })}
              {(!canSeeProduction || productionJobs.length === 0) && (
                <EmptyState message={canSeeProduction ? "No production jobs yet." : "Production jobs are visible to admin and manager roles."} />
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function DashboardHeader({
  icon: Icon,
  title,
  iconClassName,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  iconClassName: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="truncate text-lg font-semibold text-stone-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div>
      <p className="text-xs font-normal uppercase tracking-wide text-stone-400">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold", className)}>{value}</p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function ChartTooltip({ value, className }: { value: string; className: string }) {
  return (
    <span className={cn("pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100", className)}>
      {value}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-sm font-normal text-stone-400">
      {message}
    </p>
  );
}

function getCashflowTrend(entries: AccountingEntryRow[]) {
  const today = new Date();
  const months = Array.from({ length: MONTH_COUNT }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (MONTH_COUNT - 1 - index), 1);
    const key = monthKey(date);
    return {
      key,
      label: date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      income: 0,
      expense: 0,
    };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));

  for (const entry of entries) {
    const month = monthMap.get(monthKey(new Date(`${entry.entry_date}T00:00:00`)));
    if (!month) continue;

    if (entry.type === "income") {
      month.income += Number(entry.amount || 0);
    } else {
      month.expense += Number(entry.amount || 0);
    }
  }

  return months;
}

function getAxisLabels(maxValue: number) {
  const labels = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];
  return labels.map((value) => compactAmount(value));
}

function isOnOrAfterToday(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${date}T00:00:00`).getTime() >= today.getTime();
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function compactAmount(amount: number) {
  if (amount >= 100000) {
    const lakhs = amount / 100000;
    return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}L`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return `${Number.isInteger(thousands) ? thousands : Math.round(thousands)}k`;
  }
  return String(Math.round(amount));
}
