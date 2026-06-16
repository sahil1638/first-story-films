"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { LeadRowActions } from "@/components/leads/lead-row-actions";
import { Card } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import type { Lead, Event, Service } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BUDGET_RANGES } from "@/lib/constants";

interface LeadsTableProps {
  leads: Lead[];
  totalItems: number;
  events?: Event[];
  services?: Service[];
}

export function LeadsTable({ leads, totalItems, events, services }: LeadsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse current URL states
  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const urlSearch = searchParams.get("search") ?? "";
  const urlStatus = searchParams.get("status") ?? "all";
  const urlBudget = searchParams.get("budget") ?? "all";
  const urlFunctions = searchParams.get("functions") ?? "all";
  const urlDateStart = searchParams.get("dateStart") ?? "";
  const urlDateEnd = searchParams.get("dateEnd") ?? "";

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  // Local state for immediate input feedback
  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [budgetFilter, setBudgetFilter] = useState(urlBudget);
  const [functionsFilter, setFunctionsFilter] = useState(urlFunctions);
  const [dateStart, setDateStart] = useState(urlDateStart);
  const [dateEnd, setDateEnd] = useState(urlDateEnd);

  // Sync state from URL changes (e.g. back button / reset)
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

  // Helper to build URL with updated search params
  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Always reset page to 1 when search/filters change, unless we are explicitly navigating pages
    if (!updates.hasOwnProperty("page")) {
      params.set("page", "1");
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "all" || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  // Debounce search URL sync
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (search === urlSearch) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      updateUrl({ search });
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search, updateUrl, urlSearch]);

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    updateUrl({ status: val });
  };

  const handleBudgetChange = (val: string) => {
    setBudgetFilter(val);
    updateUrl({ budget: val });
  };

  const handleFunctionsChange = (val: string) => {
    setFunctionsFilter(val);
    updateUrl({ functions: val });
  };

  const handleDateStartChange = (val: string) => {
    setDateStart(val);
    updateUrl({ dateStart: val });
  };

  const handleDateEndChange = (val: string) => {
    setDateEnd(val);
    updateUrl({ dateEnd: val });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setBudgetFilter("all");
    setFunctionsFilter("all");
    setDateStart("");
    setDateEnd("");
    router.push(pathname);
  };

  const handlePageChange = (page: number) => {
    updateUrl({ page: String(page) });
  };

  const budgetOptions = useMemo(() => {
    return [
      { value: "all", label: "All Budgets" },
      ...BUDGET_RANGES.map((b) => ({ value: b, label: b })),
    ];
  }, []);

  const functionsOptions = useMemo(() => {
    return [
      { value: "all", label: "All Days" },
      ...Array.from({ length: 10 }, (_, i) => ({
        value: String(i + 1),
        label: `${i + 1} Day${i !== 0 ? "s" : ""}`,
      })),
    ];
  }, []);

  const hasActiveFilters =
    urlSearch !== "" ||
    urlStatus !== "all" ||
    urlBudget !== "all" ||
    urlFunctions !== "all" ||
    urlDateStart !== "" ||
    urlDateEnd !== "";

  return (
    <Card className="p-0 md:p-0 overflow-hidden">
      {/* Combined Search and Filters Row inside Table Card */}
      <div className="p-3 md:p-4 bg-stone-50/50">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_auto] items-end">
          <Input
            label="Search"
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Input
            label="From Date"
            type="date"
            value={dateStart}
            onChange={(e) => handleDateStartChange(e.target.value)}
          />
          <Input
            label="To Date"
            type="date"
            value={dateEnd}
            onChange={(e) => handleDateEndChange(e.target.value)}
          />
          <Select
            label="Budget"
            options={budgetOptions}
            value={budgetFilter}
            onChange={(e) => handleBudgetChange(e.target.value)}
          />
          <Select
            label="Function Days"
            options={functionsOptions}
            value={functionsFilter}
            onChange={(e) => handleFunctionsChange(e.target.value)}
          />
          <Select
            label="Status"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "convert_to_quotation", label: "Converted" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
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
            {leads.map((lead) => (
              <ClickableRow key={lead.id} href={`/leads/${lead.id}`} className="hover:bg-stone-50/50 group">
                <td className="px-4 py-1.5 md:px-5">
                  <span className="font-medium text-amber-700">
                    {lead.your_name}
                  </span>
                </td>
                <td className="px-4 py-1.5 md:px-5 font-medium text-stone-900">{lead.couple_name}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{lead.contact_number}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{formatDate(lead.wedding_date)}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{lead.budget_range || "—"}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-900">{lead.functions_count}</td>
                <td className="px-4 py-1.5 md:px-5">
                  <Badge variant={lead.status === "pending" ? "warning" : lead.status === "cancelled" ? "danger" : "info"}>
                    {lead.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </td>
                <td className="px-4 py-1.5 md:px-5 text-right">
                  <LeadRowActions lead={lead} events={events} services={services} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching leads found." : "No leads yet."}
          </p>
        )}
      </div>
      <Pagination
        currentPage={urlPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        totalItems={totalItems}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </Card>
  );
}
