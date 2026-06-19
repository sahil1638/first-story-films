import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";

export async function getDashboardData() {
  const profile = await requireRoleOrThrow(["admin", "manager", "sales"]);
  const userRole = profile.role;
  const canSeeProduction = userRole !== "sales";

  const supabase = await createClient();

  // 1. Get counts
  const [
    leadsCountRes,
    quotationsCountRes,
    ordersCountRes,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("quotations").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id", { count: "exact", head: true }),
  ]);

  // 2. Get aggregates (totals)
  const { data: totalsData, error: totalsError } = await supabase.rpc("get_dashboard_totals");
  if (totalsError) throw new Error(totalsError.message);
  const totals = totalsData?.[0] || {
    total_bookings: 0,
    total_receivable: 0,
    total_income: 0,
    total_expense: 0,
  };

  // 3. Get pipeline counts
  let pendingCount = 0;
  let inProgressCount = 0;
  let reviewCount = 0;
  let completedCount = 0;

  if (canSeeProduction) {
    const [pendingRes, inProgressRes, doneRes] = await Promise.all([
      supabase.from("production_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("production_jobs").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      supabase.from("production_jobs").select("id", { count: "exact", head: true }).eq("status", "done"),
    ]);
    pendingCount = pendingRes.count ?? 0;
    inProgressCount = inProgressRes.count ?? 0;
    reviewCount = 0;
    completedCount = doneRes.count ?? 0;
  } else {
    const [pendingRes, inProgressRes, partialPaidRes, completeRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled").eq("status", "pending"),
      supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled").eq("status", "convert_to_production"),
      supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled").eq("payment_status", "partial_paid"),
      supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled").eq("status", "complete"),
    ]);
    pendingCount = pendingRes.count ?? 0;
    inProgressCount = inProgressRes.count ?? 0;
    reviewCount = partialPaidRes.count ?? 0;
    completedCount = completeRes.count ?? 0;
  }

  // 4. Bounded recent activity queries
  const todayStr = new Date().toISOString().split("T")[0];
  const [
    upcomingShootsRes,
    receivablesRes,
    recentProductionRes,
    accountingRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id,couple_name,event_location,status,wedding_date")
      .neq("status", "cancelled")
      .gte("wedding_date", todayStr)
      .order("wedding_date", { ascending: true })
      .limit(5),
    supabase
      .from("orders_with_outstanding")
      .select("id,couple_name,created_at,paid_amount,total_amount,outstanding_amount,paid_percent")
      .neq("status", "cancelled")
      .gt("outstanding_amount", 0)
      .order("outstanding_amount", { ascending: false })
      .limit(5),
    canSeeProduction
      ? supabase
          .from("production_jobs")
          .select("id,status,created_at,orders(id,couple_name),services(name)")
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    canSeeProduction
      ? (() => {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
          sixMonthsAgo.setDate(1);
          const dateStr = sixMonthsAgo.toISOString().split("T")[0];
          return supabase
            .from("accounting_entries")
            .select("id,type,amount,entry_date,remarks,created_at")
            .gte("entry_date", dateStr)
            .order("entry_date", { ascending: false });
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (upcomingShootsRes.error) throw new Error(upcomingShootsRes.error.message);
  if (receivablesRes.error) throw new Error(receivablesRes.error.message);
  if (recentProductionRes.error) throw new Error(recentProductionRes.error.message);
  if (accountingRes.error) throw new Error(accountingRes.error.message);

  return {
    leadsCount: leadsCountRes.count ?? 0,
    quotationsCount: quotationsCountRes.count ?? 0,
    ordersCount: ordersCountRes.count ?? 0,
    totalBookings: Number(totals.total_bookings),
    totalReceivable: Number(totals.total_receivable),
    totalIncome: Number(totals.total_income),
    totalExpense: Number(totals.total_expense),
    upcomingShoots: upcomingShootsRes.data || [],
    receivables: (receivablesRes.data || []).map((r: any) => ({
      id: r.id,
      couple_name: r.couple_name,
      created_at: r.created_at,
      paid: Number(r.paid_amount),
      total: Number(r.total_amount),
      outstanding: Number(r.outstanding_amount),
      paidPercent: r.paid_percent,
    })),
    recentProductionJobs: recentProductionRes.data || [],
    accountingEntries: accountingRes.data || [],
    pipeline: [
      {
        label: "Pending",
        value: pendingCount,
        className: "border-amber-200 bg-amber-50 text-amber-700",
      },
      {
        label: "In Progress",
        value: inProgressCount,
        className: "border-blue-200 bg-blue-50 text-blue-700",
      },
      {
        label: "Review",
        value: reviewCount,
        className: "border-purple-200 bg-purple-50 text-purple-700",
      },
      {
        label: "Completed",
        value: completedCount,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      },
    ],
    userRole,
  };
}
