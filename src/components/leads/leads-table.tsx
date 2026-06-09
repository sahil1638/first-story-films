"use client";

import { useState, useMemo, useEffect } from "react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { LeadRowActions } from "@/components/leads/lead-row-actions";
import { Card } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import type { Lead } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

interface LeadsTableProps {
  leads: Lead[];
}

export function LeadsTable({ leads }: LeadsTableProps) {
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
    const unique = Array.from(new Set(leads.map(l => l.budget_range).filter(Boolean)));
    return [
      { value: "all", label: "All Budgets" },
      ...unique.sort().map(b => ({ value: b, label: b }))
    ];
  }, [leads]);

  const functionsOptions = useMemo(() => {
    const unique = Array.from(new Set(leads.map(l => l.functions_count).filter((f) => f !== null && f !== undefined)));
    return [
      { value: "all", label: "All Days" },
      ...unique.sort((a, b) => a - b).map(f => ({ value: String(f), label: `${f} Day${f !== 1 ? 's' : ''}` }))
    ];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return (leads ?? []).filter((lead) => {
      // Search Match
      const searchLower = search.toLowerCase();
      const matchesSearch =
        lead.your_name.toLowerCase().includes(searchLower) ||
        lead.couple_name.toLowerCase().includes(searchLower) ||
        lead.contact_number.toLowerCase().includes(searchLower) ||
        (lead.email ?? "").toLowerCase().includes(searchLower) ||
        lead.event_location.toLowerCase().includes(searchLower);

      // Status Match
      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;

      // Budget Match
      const matchesBudget =
        budgetFilter === "all" || lead.budget_range === budgetFilter;

      // Functions Count Match
      const matchesFunctions =
        functionsFilter === "all" || String(lead.functions_count) === functionsFilter;

      // Date Match
      const matchesDateStart = !dateStart || lead.wedding_date >= dateStart;
      const matchesDateEnd = !dateEnd || lead.wedding_date <= dateEnd;

      return matchesSearch && matchesStatus && matchesBudget && matchesFunctions && matchesDateStart && matchesDateEnd;
    });
  }, [leads, search, statusFilter, budgetFilter, functionsFilter, dateStart, dateEnd]);

  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);

  const displayedLeads = useMemo(() => {
    return filteredLeads.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredLeads, currentPage]);

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
            placeholder="Search leads..."
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
              { value: "convert_to_quotation", label: "Converted" },
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
            {displayedLeads.map((lead) => (
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
                  <LeadRowActions lead={lead} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
        {filteredLeads.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching leads found." : "No leads yet."}
          </p>
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredLeads.length}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </Card>
  );
}
