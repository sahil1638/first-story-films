"use client";

import { useState, useMemo, useEffect } from "react";
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

interface QuotationsTableProps {
  quotations: Quotation[];
}

export function QuotationsTable({ quotations }: QuotationsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [functionsFilter, setFunctionsFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, budgetFilter, functionsFilter, dateStart, dateEnd]);

  const budgetOptions = useMemo(() => {
    const unique = Array.from(new Set(quotations.map(q => q.budget_range).filter(Boolean)));
    return [
      { value: "all", label: "All Budgets" },
      ...unique.sort().map(b => ({ value: b, label: b }))
    ];
  }, [quotations]);

  const functionsOptions = useMemo(() => {
    const unique = Array.from(new Set(quotations.map(q => q.functions_count).filter((f) => f !== null && f !== undefined)));
    return [
      { value: "all", label: "All Days" },
      ...unique.sort((a, b) => a - b).map(f => ({ value: String(f), label: `${f} Day${f !== 1 ? 's' : ''}` }))
    ];
  }, [quotations]);

  const filteredQuotations = useMemo(() => {
    return (quotations ?? []).filter((q) => {
      // Search Match
      const searchLower = search.toLowerCase();
      const matchesSearch =
        q.your_name.toLowerCase().includes(searchLower) ||
        q.couple_name.toLowerCase().includes(searchLower) ||
        q.contact_number.toLowerCase().includes(searchLower) ||
        (q.email ?? "").toLowerCase().includes(searchLower) ||
        q.event_location.toLowerCase().includes(searchLower);

      // Status Match
      const matchesStatus =
        statusFilter === "all" || q.status === statusFilter;

      // Budget Match
      const matchesBudget =
        budgetFilter === "all" || q.budget_range === budgetFilter;

      // Functions Count Match
      const matchesFunctions =
        functionsFilter === "all" || String(q.functions_count) === functionsFilter;

      // Date Match
      const matchesDateStart = !dateStart || q.wedding_date >= dateStart;
      const matchesDateEnd = !dateEnd || q.wedding_date <= dateEnd;

      return matchesSearch && matchesStatus && matchesBudget && matchesFunctions && matchesDateStart && matchesDateEnd;
    });
  }, [quotations, search, statusFilter, budgetFilter, functionsFilter, dateStart, dateEnd]);

  const totalPages = Math.ceil(filteredQuotations.length / ITEMS_PER_PAGE);

  const displayedQuotations = useMemo(() => {
    return filteredQuotations.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredQuotations, currentPage]);

  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "all" ||
    budgetFilter !== "all" ||
    functionsFilter !== "all" ||
    dateStart !== "" ||
    dateEnd !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setBudgetFilter("all");
    setFunctionsFilter("all");
    setDateStart("");
    setDateEnd("");
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
            onChange={(e) => setDateStart(e.target.value)}
          />
          <Input
            label="To Date"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
          <Select
            label="Budget"
            options={budgetOptions}
            value={budgetFilter}
            onChange={(e) => setBudgetFilter(e.target.value)}
          />
          <Select
            label="Function Days"
            options={functionsOptions}
            value={functionsFilter}
            onChange={(e) => setFunctionsFilter(e.target.value)}
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
            onChange={(e) => setStatusFilter(e.target.value)}
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
            {displayedQuotations.map((q) => (
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
        {filteredQuotations.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching quotations found." : "No quotations yet. Convert a lead first."}
          </p>
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredQuotations.length}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </Card>
  );
}
