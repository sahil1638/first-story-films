import { PublicLeadForm } from "@/components/leads/public-lead-form";
import { BackButton } from "@/components/ui/back-button";
import { getActiveEvents, getActiveServices } from "@/lib/data/masters";

export default async function NewLeadPage() {
  const [events, services] = await Promise.all([
    getActiveEvents(),
    getActiveServices(),
  ]);

  return (
    <div className="space-y-6">
      <div className="no-print">
        <BackButton href="/leads" />
      </div>
      <h1 className="text-2xl font-semibold text-stone-900">Add Lead Manually</h1>
      <PublicLeadForm isDashboard={true} events={events} services={services} />
    </div>
  );
}
