import { getQuotations } from "@/lib/data/quotations";
import { QuotationsTable } from "@/components/quotations/quotations-table";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    budget?: string;
    functions?: string;
    dateStart?: string;
    dateEnd?: string;
  }>;
}

export default async function QuotationsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const quotationsData = await getQuotations({
    page,
    limit: 20,
    search: searchParams.search ?? "",
    status: searchParams.status ?? "all",
    budget: searchParams.budget ?? "all",
    functions: searchParams.functions ?? "all",
    dateStart: searchParams.dateStart ?? "",
    dateEnd: searchParams.dateEnd ?? "",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Quotations</h1>
      </div>
      <QuotationsTable quotations={quotationsData.quotations} totalItems={quotationsData.count} />
    </div>
  );
}
