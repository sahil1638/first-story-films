import { createClient } from "@/lib/supabase/server";
import { AddLeadModal } from "@/components/leads/add-lead-modal";
import { LeadsTable } from "@/components/leads/leads-table";
import type { Lead } from "@/types/database";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    budget?: string;
    functions?: string;
    dateStart?: string;
    dateEnd?: string;
  }>;
}

export default async function LeadsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "all";
  const budget = searchParams.budget ?? "all";
  const functions = searchParams.functions ?? "all";
  const dateStart = searchParams.dateStart ?? "";
  const dateEnd = searchParams.dateEnd ?? "";

  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select("*, lead_function_days(*, lead_function_day_services(service_id))", { count: "exact" });

  if (search) {
    query = query.or(`your_name.ilike.%${search}%,couple_name.ilike.%${search}%,contact_number.ilike.%${search}%,email.ilike.%${search}%,event_location.ilike.%${search}%`);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (budget !== "all") {
    query = query.eq("budget_range", budget);
  }
  if (functions !== "all") {
    query = query.eq("functions_count", Number(functions));
  }
  if (dateStart) {
    query = query.gte("wedding_date", dateStart);
  }
  if (dateEnd) {
    query = query.lte("wedding_date", dateEnd);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Error fetching leads:", error);
  }

  const leads = (data ?? []) as Lead[];
  const totalItems = count ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Leads</h1>
        <AddLeadModal />
      </div>

      <LeadsTable leads={leads} totalItems={totalItems} />
    </div>
  );
}
