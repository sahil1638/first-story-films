import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { InvoiceType } from "@/types/database";

export const GST_RATE_PERCENT = 18;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateOrderBilling(
  baseAmount: number,
  invoiceType: InvoiceType
) {
  const normalizedBase = Number.isFinite(baseAmount) && baseAmount > 0 ? baseAmount : 0;
  const gstAmount = invoiceType === "gst" ? normalizedBase * (GST_RATE_PERCENT / 100) : 0;
  const totalAmount = normalizedBase + gstAmount;

  return {
    baseAmount: normalizedBase,
    gstAmount,
    totalAmount,
  };
}

export function formatDate(date: string | Date) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function computePaymentStatus(
  totalAmount: number,
  paidAmount: number
): "paid" | "partial_paid" | "unpaid" {
  if (paidAmount <= 0) return "unpaid";
  if (totalAmount > 0 && paidAmount >= totalAmount) return "paid";
  return "partial_paid";
}
