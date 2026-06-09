"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createInvoice } from "@/lib/actions/invoices";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { InvoiceType } from "@/types/database";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  amount: number;
  generated_at: string;
};

export function OrderInvoices({
  orderId,
  invoices,
}: {
  orderId: string;
  invoices: InvoiceRow[];
}) {
  const router = useRouter();
  const [type, setType] = useState<InvoiceType>("gst");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) {
      alert("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      await createInvoice(orderId, type, n);
      setAmount("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Invoices"
        description="GST or non-GST invoice records. Use browser Print on a detail page for PDF later."
      />
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-stone-100 p-4">
        <Select
          label="Type"
          className="min-w-[160px]"
          options={[
            { value: "gst", label: "GST Invoice" },
            { value: "non_gst", label: "Non-GST Invoice" },
          ]}
          value={type}
          onChange={(e) => setType(e.target.value as InvoiceType)}
        />
        <Input
          label="Amount (₹)"
          type="number"
          min={1}
          step={1}
          className="max-w-xs"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button loading={loading} onClick={submit} tooltip="Add Invoice">
          Generate invoice
        </Button>
      </div>
      <ul className="divide-y divide-stone-100 text-sm">
        {invoices.map((inv) => (
          <li key={inv.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-medium text-stone-900">{inv.invoice_number}</span>
            <span className="text-stone-600">
              {inv.invoice_type === "gst" ? "GST" : "Non-GST"} ·{" "}
              {formatDate(inv.generated_at)}
            </span>
            <span className="font-semibold text-stone-900">
              {formatCurrency(Number(inv.amount))}
            </span>
          </li>
        ))}
        {invoices.length === 0 && (
          <li className="py-6 text-center text-stone-500">No invoices yet.</li>
        )}
      </ul>
    </Card>
  );
}
