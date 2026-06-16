import { AddLeadModal } from "@/components/leads/add-lead-modal";
import { LeadsTable } from "@/components/leads/leads-table";
import { getLeads } from "@/lib/data/leads";
import { getActiveEvents, getActiveServices } from "@/lib/data/masters";

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

export default async function LeadsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "all";
  const budget = searchParams.budget ?? "all";
  const functions = searchParams.functions ?? "all";
  const dateStart = searchParams.dateStart ?? "";
  const dateEnd = searchParams.dateEnd ?? "";

  const limit = 20;

  const [leadsData, events, services] = await Promise.all([
    getLeads({
      page,
      limit,
      search,
      status,
      budget,
      functions,
      dateStart,
      dateEnd,
    }),
    getActiveEvents(),
    getActiveServices(),
  ]);

  const { leads, count: totalItems } = leadsData;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Leads</h1>
        <AddLeadModal events={events} services={services} />
      </div>

      <LeadsTable leads={leads} totalItems={totalItems} events={events} services={services} />
    </div>
  );
}
