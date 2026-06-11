import { PublicLeadForm } from "@/components/leads/public-lead-form";
import { BackButton } from "@/components/ui/back-button";

export default function NewLeadPage() {
  return (
    <div className="space-y-6">
      <div className="no-print">
        <BackButton href="/leads" />
      </div>
      <h1 className="text-2xl font-semibold text-stone-900">Add Lead Manually</h1>
      <PublicLeadForm isDashboard={true} />
    </div>
  );
}
