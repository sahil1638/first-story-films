import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { AgencyCrewForm } from "@/components/masters/agency-crew-form";
import { getCrewMembers, getServices } from "@/lib/data/masters";

export default async function CrewMasterPage() {
  await requireManagerOrAdmin();
  const [crew, allServices] = await Promise.all([
    getCrewMembers(),
    getServices(),
  ]);

  const services = allServices.filter((s) => s.status === "active");

  return (
    <AgencyCrewForm
      mode="crew"
      title="Videographers / Photographers"
      items={crew as Parameters<typeof AgencyCrewForm>[0]["items"]}
      services={services}
    />
  );
}
