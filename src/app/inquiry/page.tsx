import { createClient } from "@/lib/supabase/server";
import { PublicLeadForm } from "@/components/leads/public-lead-form";

export const metadata = {
  title: "Wedding Inquiry | First Story Films",
  description: "Submit your wedding inquiry to First Story Films. Share your wedding dates, venue, events, photography, and cinematography requirements with us.",
  alternates: {
    canonical: "/inquiry",
  },
};

export default async function InquiryPage() {
  const supabase = await createClient();
  const [eventsRes, servicesRes] = await Promise.all([
    supabase.from("events").select("*").eq("status", "active"),
    supabase.from("services").select("*").eq("status", "active"),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-amber-50/30 py-10 px-4">
      <PublicLeadForm
        events={eventsRes.data ?? []}
        services={servicesRes.data ?? []}
      />
    </div>
  );
}
