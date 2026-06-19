"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { QuotationRowActions } from "@/components/quotations/quotation-row-actions";
import { Card } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import type { Quotation } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BUDGET_RANGES } from "@/lib/constants";

interface QuotationsTableProps {
  quotations: Quotation[];
  totalItems: number;
}

export function QuotationsTable({ quotations, totalItems }: QuotationsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const urlSearch = searchParams.get("search") ?? "";
  const urlStatus = searchParams.get("status") ?? "all";
  const urlBudget = searchParams.get("budget") ?? "all";
  const urlFunctions = searchParams.get("functions") ?? "all";
  const urlDateStart = searchParams.get("dateStart") ?? "";
  const urlDateEnd = searchParams.get("dateEnd") ?? "";

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [budgetFilter, setBudgetFilter] = useState(urlBudget);
  const [functionsFilter, setFunctionsFilter] = useState(urlFunctions);
  const [dateStart, setDateStart] = useState(urlDateStart);
  const [dateEnd, setDateEnd] = useState(urlDateEnd);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(urlSearch);
      setStatusFilter(urlStatus);
      setBudgetFilter(urlBudget);
      setFunctionsFilter(urlFunctions);
      setDateStart(urlDateStart);
      setDateEnd(urlDateEnd);
    }, 0);
    return () => clearTimeout(timer);
  }, [urlSearch, urlStatus, urlBudget, urlFunctions, urlDateStart, urlDateEnd]);

  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!Object.hasOwn(updates, "page")) {
      params.set("page", "1");
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "all" || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (search === urlSearch) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => updateUrl({ search }), 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search, updateUrl, urlSearch]);

  const budgetOptions = [
    { value: "all", label: "All Budgets" },
    ...BUDGET_RANGES.map((b) => ({ value: b, label: b })),
  ];

  const functionsOptions = [
    { value: "all", label: "All Days" },
    ...Array.from({ length: 10 }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1} Day${i !== 0 ? "s" : ""}`,
    })),
  ];

  const hasActiveFilters =
    urlSearch !== "" ||
    urlStatus !== "all" ||
    urlBudget !== "all" ||
    urlFunctions !== "all" ||
    urlDateStart !== "" ||
    urlDateEnd !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setBudgetFilter("all");
    setFunctionsFilter("all");
    setDateStart("");
    setDateEnd("");
    router.push(pathname);
  };

  return (
    <Card className="p-0 md:p-0 overflow-hidden">
      {/* Combined Search and Filters Row inside Table Card */}
      <div className="p-3 md:p-4 bg-stone-50/50">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_auto] items-end">
          <Input
            label="Search"
            type="text"
            placeholder="Search quotations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            label="From Date"
            type="date"
            value={dateStart}
            onChange={(e) => {
              setDateStart(e.target.value);
              updateUrl({ dateStart: e.target.value });
            }}
          />
          <Input
            label="To Date"
            type="date"
            value={dateEnd}
            onChange={(e) => {
              setDateEnd(e.target.value);
              updateUrl({ dateEnd: e.target.value });
            }}
          />
          <Select
            label="Budget"
            options={budgetOptions}
            value={budgetFilter}
            onChange={(e) => {
              setBudgetFilter(e.target.value);
              updateUrl({ budget: e.target.value });
            }}
          />
          <Select
            label="Function Days"
            options={functionsOptions}
            value={functionsFilter}
            onChange={(e) => {
              setFunctionsFilter(e.target.value);
              updateUrl({ functions: e.target.value });
            }}
          />
          <Select
            label="Status"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "convert_to_order", label: "Converted" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              updateUrl({ status: e.target.value });
            }}
          />
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              tooltip="Reset"
              className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Table Container with Top Border */}
      <div className="overflow-x-auto border-t border-stone-200">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200 select-none">
            <tr>
              <th className="px-4 py-1.5 md:px-5 font-medium">Name</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Couple</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Contact</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Wedding Date</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Budget</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Function Days</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Status</th>
              <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {quotations.map((q) => (
              <ClickableRow key={q.id} href={`/quotations/${q.id}`} className="hover:bg-stone-50/50 group">
                <td className="px-4 py-1.5 md:px-5">
                  <span className="font-medium text-amber-700">
                    {q.your_name}
                  </span>
                </td>
                <td className="px-4 py-1.5 md:px-5 font-medium text-stone-900">{q.couple_name}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{q.contact_number}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{formatDate(q.wedding_date)}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{q.budget_range || "—"}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-900">{q.functions_count}</td>
                <td className="px-4 py-1.5 md:px-5">
                  <Badge variant={q.status === "pending" ? "warning" : q.status === "cancelled" ? "danger" : "success"}>
                    {q.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </td>
                <td className="px-4 py-1.5 md:px-5 text-right">
                  <QuotationRowActions quotation={q} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
        {quotations.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching quotations found." : "No quotations yet. Convert a lead first."}
          </p>
        )}
      </div>
      <Pagination
        currentPage={urlPage}
        totalPages={totalPages}
        onPageChange={(page) => updateUrl({ page: String(page) })}
        totalItems={totalItems}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </Card>
  );
}
