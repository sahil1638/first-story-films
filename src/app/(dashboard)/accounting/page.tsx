import { AccountingContent } from "@/components/accounting/accounting-content";
import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { getAccounts, getCategories, getEntries } from "@/lib/data/accounting";

export default async function AccountingPage() {
  await requireManagerOrAdmin();
  const [accountsResult, categoriesResult, entriesResult] = await Promise.all([
    getAccounts({ limit: 100, sortBy: "name", sortOrder: "asc" }),
    getCategories({ limit: 100, sortBy: "name", sortOrder: "asc" }),
    getEntries({ limit: 200, sortBy: "entry_date", sortOrder: "desc" }),
  ]);

  return (
    <div className="space-y-6">
      <AccountingContent
        accounts={accountsResult.accounts}
        categories={categoriesResult.categories}
        entries={entriesResult.entries}
      />
    </div>
  );
}
