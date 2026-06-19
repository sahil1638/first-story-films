"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BUDGET_RANGES } from "@/lib/constants";

interface OrdersTableProps {
  orders: Order[];
  totalItems: number;
}

export function OrdersTable({ orders, totalItems }: OrdersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const urlSearch = searchParams.get("search") ?? "";
  const urlStatus = searchParams.get("status") ?? "all";
  const urlPayment = searchParams.get("payment") ?? "all";
  const urlBill = searchParams.get("bill") ?? "all";
  const urlBudget = searchParams.get("budget") ?? "all";
  const urlDateStart = searchParams.get("dateStart") ?? "";
  const urlDateEnd = searchParams.get("dateEnd") ?? "";

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const [search, setSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [paymentFilter, setPaymentFilter] = useState(urlPayment);
  const [billFilter, setBillFilter] = useState(urlBill);
  const [budgetFilter, setBudgetFilter] = useState(urlBudget);
  const [dateStart, setDateStart] = useState(urlDateStart);
  const [dateEnd, setDateEnd] = useState(urlDateEnd);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(urlSearch);
      setStatusFilter(urlStatus);
      setPaymentFilter(urlPayment);
      setBillFilter(urlBill);
      setBudgetFilter(urlBudget);
      setDateStart(urlDateStart);
      setDateEnd(urlDateEnd);
    }, 0);
    return () => clearTimeout(timer);
  }, [urlSearch, urlStatus, urlPayment, urlBill, urlBudget, urlDateStart, urlDateEnd]);

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

  const hasActiveFilters =
    urlSearch !== "" ||
    urlStatus !== "all" ||
    urlPayment !== "all" ||
    urlBill !== "all" ||
    urlBudget !== "all" ||
    urlDateStart !== "" ||
    urlDateEnd !== "";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setBillFilter("all");
    setBudgetFilter("all");
    setDateStart("");
    setDateEnd("");
    router.push(pathname);
  };

  const budgetOptions = [
    { value: "all", label: "All Budgets" },
    ...BUDGET_RANGES.map((b) => ({ value: b, label: b })),
  ];

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
            label="Bill Type"
            options={[
              { value: "all", label: "All Bill Types" },
              { value: "gst", label: "GST" },
              { value: "non_gst", label: "Non-GST" },
            ]}
            value={billFilter}
            onChange={(e) => {
              setBillFilter(e.target.value);
              updateUrl({ bill: e.target.value });
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
            label="Payment Status"
            options={[
              { value: "all", label: "All Payments" },
              { value: "paid", label: "Paid" },
              { value: "partial_paid", label: "Partial Paid" },
              { value: "unpaid", label: "Unpaid" },
            ]}
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              updateUrl({ payment: e.target.value });
            }}
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
              <th className="px-4 py-1.5 md:px-5 font-medium">Bill Type</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Total Payment</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Payment Status</th>
              <th className="px-4 py-1.5 md:px-5 font-medium">Status</th>
              <th className="px-4 py-1.5 md:px-5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {orders.map((o) => (
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
        {orders.length === 0 && (
          <p className="py-8 text-center text-stone-500">
            {hasActiveFilters ? "No matching orders found." : "No orders yet."}
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
