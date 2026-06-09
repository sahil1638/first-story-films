"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateQuotationTerms } from "@/lib/actions/quotations";

export function QuotationTermsCard({
  quotationId,
  initialTerms,
  defaultTerms,
}: {
  quotationId: string;
  initialTerms: string | null;
  defaultTerms: string;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState(initialTerms ?? defaultTerms ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveTerms() {
    setSaving(true);
    setError("");
    try {
      await updateQuotationTerms(quotationId, terms);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update terms");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Terms & Conditions</h3>
        </div>
        <Button type="button" size="sm" onClick={saveTerms} loading={saving}>
          Save
        </Button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <textarea
        value={terms}
        onChange={(event) => setTerms(event.target.value)}
        placeholder="Write terms and conditions for this quotation..."
        disabled={saving}
        className="min-h-[120px] flex-1 resize-y rounded-xl border border-amber-500 bg-white p-3 text-sm leading-relaxed text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
      />
    </div>
  );
}
