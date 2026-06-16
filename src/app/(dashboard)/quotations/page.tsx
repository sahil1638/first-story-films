import { getQuotations } from "@/lib/data/quotations";
import { QuotationsTable } from "@/components/quotations/quotations-table";

export default async function QuotationsPage() {
  const quotations = await getQuotations();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Quotations</h1>
      </div>
      <QuotationsTable quotations={quotations} />
    </div>
  );
}
