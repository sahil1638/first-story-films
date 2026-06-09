import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { AgencyCrewForm } from "@/components/masters/agency-crew-form";

export default async function AgenciesMasterPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const [{ data: agencies }, { data: services }] = await Promise.all([
    supabase.from("agencies").select("*, agency_services(service_id)").order("created_at", { ascending: false }),
    supabase.from("services").select("*").eq("status", "active"),
  ]);

  return (
    <AgencyCrewForm
      mode="agency"
      title="Agency Master"
      items={(agencies ?? []) as Parameters<typeof AgencyCrewForm>[0]["items"]}
      services={services ?? []}
    />
  );
}
