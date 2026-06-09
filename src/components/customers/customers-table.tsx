"use client";

import { useState, useMemo, useEffect } from "react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Search, X } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";

interface CustomerData {
  id: string;
  couple_name: string;
  contact_number: string;
  email: string | null;
  order_id: string | null;
  created_at: string;
  displayName: string;
  displayEmail: string | null;
  latestOrderDate: string;
}

interface CustomersTableProps {
  customers: CustomerData[];
}

export function CustomersTable({ customers }: CustomersTableProps) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const filteredCustomers = useMemo(() => {
    return (customers ?? []).filter((c) => {
      const searchLower = search.toLowerCase();
      return (
        c.displayName.toLowerCase().includes(searchLower) ||
        (c.displayEmail ?? "").toLowerCase().includes(searchLower) ||
        c.contact_number.toLowerCase().includes(searchLower)
      );
    });
  }, [customers, search]);

  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [search]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  const displayedCustomers = useMemo(() => {
    return filteredCustomers.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredCustomers, currentPage]);

  return (
    <div>
      {/* Top Header with Page Title and Right-aligned Search */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-6 select-none">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Customers</h1>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-full rounded-lg border border-stone-200 bg-white pl-9 pr-8 py-2 text-sm placeholder-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all duration-150 shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Card className="p-0 md:p-0 overflow-hidden">
        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200 select-none">
              <tr>
                <th className="px-4 py-1.5 md:px-5 font-medium">Name</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Email</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Contact</th>
                <th className="px-4 py-1.5 md:px-5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {displayedCustomers.map((c) => (
                <ClickableRow key={c.contact_number} href={`/customers/${c.id}`} className="hover:bg-stone-50/50 group">
                  <td className="px-4 py-1.5 md:px-5">
                    <span className="font-medium text-amber-700">
                      {c.displayName}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 md:px-5 text-stone-600">{c.displayEmail || "-"}</td>
                  <td className="px-4 py-1.5 md:px-5 text-stone-600">{c.contact_number}</td>
                  <td className="px-4 py-1.5 md:px-5 text-stone-600">{formatDate(c.latestOrderDate)}</td>
                </ClickableRow>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                    {search ? "No matching customers found." : "No customers yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredCustomers.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </Card>
    </div>
  );
}
