import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { AgencyCrewForm } from "@/components/masters/agency-crew-form";
import { getAgencies, getServices } from "@/lib/data/masters";

export default async function AgenciesMasterPage() {
  await requireManagerOrAdmin();
  const [agencies, allServices] = await Promise.all([
    getAgencies(),
    getServices(),
  ]);

  const services = allServices.filter((s) => s.status === "active");

  return (
    <AgencyCrewForm
      mode="agency"
      title="Agency Master"
      items={agencies as Parameters<typeof AgencyCrewForm>[0]["items"]}
      services={services}
    />
  );
}
