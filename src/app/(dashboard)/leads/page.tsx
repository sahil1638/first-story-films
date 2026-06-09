import { createClient } from "@/lib/supabase/server";
import { AddLeadModal } from "@/components/leads/add-lead-modal";
import { LeadsTable } from "@/components/leads/leads-table";
import type { Lead } from "@/types/database";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*, lead_function_days(*, lead_function_day_services(service_id))")
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Leads</h1>
        <AddLeadModal />
      </div>

      <LeadsTable leads={leads} />
    </div>
  );
}
