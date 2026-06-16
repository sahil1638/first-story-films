import { PublicLeadForm } from "@/components/leads/public-lead-form";
import { getActiveEvents, getActiveServices } from "@/lib/data/masters";

export const metadata = {
  title: "Wedding Inquiry | First Story Films",
  description: "Submit your wedding inquiry to First Story Films. Share your wedding dates, venue, events, photography, and cinematography requirements with us.",
  alternates: {
    canonical: "/inquiry",
  },
};

export default async function InquiryPage() {
  const [events, services] = await Promise.all([
    getActiveEvents(),
    getActiveServices(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-amber-50/30 py-10 px-4">
      <PublicLeadForm
        events={events}
        services={services}
      />
    </div>
  );
}
