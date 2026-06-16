import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";

export async function getDashboardData() {
  const profile = await requireRoleOrThrow(["admin", "manager", "sales"]);
  const userRole = profile.role;
  const canSeeProduction = userRole !== "sales";

  const supabase = await createClient();

  const [
    leadsCountRes,
    quotationsCountRes,
    ordersCountRes,
    ordersRes,
    accountingRes,
    productionRes,
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

  if (ordersRes.error) throw new Error(ordersRes.error.message);

  return {
    leadsCount: leadsCountRes.count ?? 0,
    quotationsCount: quotationsCountRes.count ?? 0,
    ordersCount: ordersCountRes.count ?? 0,
    orders: ordersRes.data ?? [],
    accountingEntries: canSeeProduction ? (accountingRes.data ?? []) : [],
    productionJobs: canSeeProduction ? (productionRes.data ?? []) : [],
    userRole,
  };
}
