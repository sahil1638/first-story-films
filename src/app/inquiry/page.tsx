import { PublicLeadForm } from "@/components/leads/public-lead-form";

export const metadata = {
  title: "Wedding Inquiry | First Story Films",
};

export default function InquiryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-amber-50/30 py-10 px-4">
      <PublicLeadForm />
    </div>
  );
}
