import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { QuotationsTable } from "@/components/quotations/quotations-table";
import type { Quotation } from "@/types/database";

export default async function QuotationsPage() {
  await requireRole(["admin", "manager", "sales"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotations")
    .select("*")
    .order("created_at", { ascending: false });

  const quotations = (data ?? []) as Quotation[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Quotations</h1>
      </div>
      <QuotationsTable quotations={quotations} />
    </div>
  );
}
