import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { AgencyCrewForm } from "@/components/masters/agency-crew-form";

export default async function CrewMasterPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const [{ data: crew }, { data: services }] = await Promise.all([
    supabase.from("crew_members").select("*, crew_member_services(service_id)").order("created_at", { ascending: false }),
    supabase.from("services").select("*").eq("status", "active"),
  ]);

  return (
    <AgencyCrewForm
      mode="crew"
      title="Videographers / Photographers"
      items={(crew ?? []) as Parameters<typeof AgencyCrewForm>[0]["items"]}
      services={services ?? []}
    />
  );
}
