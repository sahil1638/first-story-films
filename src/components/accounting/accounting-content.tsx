"use client";

import { useState } from "react";
import { EntriesTab } from "@/components/accounting/entries-tab";
import { CategoriesTab } from "@/components/accounting/categories-tab";
import { AccountsTab } from "@/components/accounting/accounts-tab";
import type { AccountingEntry, AccountingAccount, AccountingCategory } from "@/types/database";

interface AccountingPageProps {
  entries: AccountingEntry[];
  accounts: AccountingAccount[];
  categories: AccountingCategory[];
}

export function AccountingContent({
  entries,
  accounts,
  categories,
}: AccountingPageProps) {
  const [activeTab, setActiveTab] = useState<"entries" | "accounts" | "categories">("entries");

  const tabs: { id: "entries" | "accounts" | "categories"; label: string }[] = [
    { id: "entries", label: "Entries" },
    { id: "accounts", label: "Accounts" },
    { id: "categories", label: "Categories" },
  ];

  return (
    <div>
      {/* Compact Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-3">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Accounting</h1>
        <div id="accounting-header-actions" className="flex flex-wrap justify-end gap-2" />
      </div>

      {/* Tighter Tab Bar and Tab buttons */}
      <div className="mb-4 flex gap-0 border-b border-stone-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? "border-b-2 border-amber-600 text-amber-600 font-semibold"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "entries" && <EntriesTab entries={entries} accounts={accounts} categories={categories} />}
      {activeTab === "accounts" && <AccountsTab accounts={accounts} entries={entries} categories={categories} />}
      {activeTab === "categories" && <CategoriesTab categories={categories} entries={entries} />}
    </div>
  );
}
