import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function InquirySuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-stone-50 to-amber-50/30 p-4">
      <Card className="max-w-md text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-semibold text-stone-900">
          Thank you!
        </h1>
        <p className="mt-2 text-stone-600">
          Your wedding inquiry has been submitted successfully. Our team will
          contact you shortly.
        </p>
        <Link href="/inquiry" className="mt-6 inline-block">
          <Button variant="outline" tooltip="New Inquiry">Submit another inquiry</Button>
        </Link>
      </Card>
    </div>
  );
}
