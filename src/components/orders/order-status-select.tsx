"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/lib/actions/orders";
import { ORDER_STATUSES } from "@/lib/constants";

export function OrderStatusSelect({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(nextStatus: string) {
    setValue(nextStatus);
    setSaving(true);
    try {
      await updateOrderStatus(orderId, nextStatus);
      router.refresh();
    } catch (err) {
      setValue(status);
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(event) => handleChange(event.target.value)}
      className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold uppercase tracking-wide text-stone-700 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
      aria-label="Order status"
    >
      {ORDER_STATUSES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
