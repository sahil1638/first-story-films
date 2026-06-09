"use client";

import { useState, useMemo, useEffect } from "react";
import { ClickableRow } from "@/components/ui/clickable-row";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { OrderRowActions } from "@/components/orders/order-row-actions";
import { Card } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import type { Order } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

interface OrdersTableProps {
  orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [billFilter, setBillFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    statusFilter,
    paymentFilter,
    billFilter,
    budgetFilter,
    dateStart,
    dateEnd,
  ]);

  const budgetOptions = useMemo(() => {
    const unique = Array.from(new Set(orders.map(o => o.budget_range).filter(Boolean)));
    return [
      { value: "all", label: "All Budgets" },
      ...unique.sort().map(b => ({ value: b!, label: b! }))
    ];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return (orders ?? []).filter((o) => {
      // Search Match
      const searchLower = search.toLowerCase();
      const matchesSearch =
        o.your_name.toLowerCase().includes(searchLower) ||
        o.couple_name.toLowerCase().includes(searchLower) ||
        o.contact_number.toLowerCase().includes(searchLower) ||
        (o.email ?? "").toLowerCase().includes(searchLower) ||
        o.event_location.toLowerCase().includes(searchLower);

      // Status Match
      const matchesStatus =
        statusFilter === "all" || o.status === statusFilter;

      // Payment Status Match
      const matchesPayment =
        paymentFilter === "all" || o.payment_status === paymentFilter;

      // Bill Type Match
      const matchesBill =
        billFilter === "all" ||
        (billFilter === "gst" && o.invoice_type === "gst") ||
        (billFilter === "non_gst" && o.invoice_type !== "gst");

      // Budget Match
      const matchesBudget =
        budgetFilter === "all" || o.budget_range === budgetFilter;

      // Date Match
      const matchesDateStart = !dateStart || o.wedding_date >= dateStart;
      const matchesDateEnd = !dateEnd || o.wedding_date <= dateEnd;

      return matchesSearch && matchesStatus && matchesPayment && matchesBill && matchesBudget && matchesDateStart && matchesDateEnd;
    });
  }, [orders, search, statusFilter, paymentFilter, billFilter, budgetFilter, dateStart, dateEnd]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

  const displayedOrders = useMemo(() => {
    return filteredOrders.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredOrders, currentPage]);

  const hasActiveFilters =
    search !== "" ||
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    billFilter !== "all" ||
    budgetFilter !== "all" ||
    dateStart !== "" ||
    dateEnd !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setBillFilter("all");
    setBudgetFilter("all");
    setDateStart("");
    setDateEnd("");
  };

  return (
    <Card className="p-0 md:p-0 overflow-hidden">
      {/* Combined Search and Filters Row inside Table Card */}
      <div className="p-3 md:p-4 bg-stone-50/50">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] items-end">
          <Input
            label="Search"
            type="text"
            placeholder="Search orders..."
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
            label="Bill Type"
            options={[
              { value: "all", label: "All Bill Types" },
              { value: "gst", label: "GST" },
              { value: "non_gst", label: "Non-GST" },
            ]}
            value={billFilter}
            onChange={(e) => setBillFilter(e.target.value)}
          />
          <Select
            label="Budget"
            options={budgetOptions}
            value={budgetFilter}
            onChange={(e) => setBudgetFilter(e.target.value)}
          />
          <Select
            label="Payment Status"
            options={[
              { value: "all", label: "All Payments" },
              { value: "paid", label: "Paid" },
              { value: "partial_paid", label: "Partial Paid" },
              { value: "unpaid", label: "Unpaid" },
            ]}
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          />
          <Select
            label="Status"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "pending", label: "Pending" },
              { value: "complete", label: "Complete" },
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
              <th className="px-4 py-1.5 md:px-5 font-medium">Bill Type</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Total Payment</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Payment Status</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Status</th>
              <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {displayedOrders.map((o) => (
              <ClickableRow key={o.id} href={`/orders/${o.id}`} className="hover:bg-stone-50/50 group">
                <td className="px-4 py-1.5 md:px-5">
                  <span className="font-medium text-amber-700">
                    {o.your_name || o.couple_name}
                  </span>
                </td>
                <td className="px-4 py-1.5 md:px-5 font-medium text-stone-900">{o.couple_name}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{o.contact_number}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{formatDate(o.wedding_date)}</td>
                <td className="px-4 py-1.5 md:px-5 text-stone-600">{o.invoice_type === "gst" ? "GST" : "Non-GST"}</td>
                <td className="px-4 py-1.5 md:px-5 font-medium text-stone-900">{formatCurrency(Number(o.total_amount))}</td>
                <td className="px-4 py-1.5 md:px-5">
                  <Badge variant={o.payment_status === "paid" ? "success" : "warning"}>
                    {o.payment_status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </td>
                <td className="px-4 py-1.5 md:px-5">
                  <Badge variant={
                    o.status === "pending" ? "warning" :
                      o.status === "cancelled" ? "danger" :
                        o.status === "complete" ? "success" : "info"
                  }>
                    {o.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </td>
                <td className="px-4 py-1.5 md:px-5 text-right">
                  <OrderRowActions order={o} />
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching orders found." : "No orders yet."}
          </p>
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalItems={filteredOrders.length}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </Card>
  );
}
