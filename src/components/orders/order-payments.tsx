"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { PdfDownloadButton } from "@/components/ui/pdf-download-button";
import { addPayment, deletePayment, updatePayment } from "@/lib/actions/orders";
import { formatCurrency, formatDate } from "@/lib/utils";

type PaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  receipt_number: string;
  notes?: string | null;
};

export function OrderPayments({
  orderId,
  payments,
  totalAmount,
  paidAmount,
}: {
  orderId: string;
  payments: PaymentRow[];
  totalAmount: number;
  paidAmount: number;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PaymentRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (formOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [formOpen]);

  async function submit() {
    setError("");
    const value = Number(amount);
    const remaining = Math.max(0, totalAmount - paidAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (!editingPayment && totalAmount <= 0) {
      setError("Set the order total first, then add payments.");
      return;
    }
    if (!editingPayment && remaining <= 0) {
      setError("This order is already fully paid.");
      return;
    }
    const allowedAmount = editingPayment
      ? remaining + Number(editingPayment.amount)
      : remaining;
    if (value > allowedAmount) {
      setError(`Payment cannot exceed remaining amount of ${formatCurrency(allowedAmount)}.`);
      return;
    }

    setLoading(true);
    try {
      if (editingPayment) {
        await updatePayment(editingPayment.id, orderId, value, date, notes.trim());
      } else {
        await addPayment(orderId, value, date, notes.trim());
      }
      setAmount("");
      setNotes("");
      setEditingPayment(null);
      setFormOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add payment");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await deletePayment(pendingDelete.id, orderId);
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  }

  const remaining = Math.max(0, totalAmount - paidAmount);

  return (
    <Card className="!p-3">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CreditCard className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Payments</h3>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setError("");
            setAmount("");
            setNotes("");
            setEditingPayment(null);
            setDate(new Date().toISOString().slice(0, 10));
            setFormOpen(true);
          }}
          disabled={totalAmount <= 0 || remaining <= 0}
          className="flex items-center gap-2"
          tooltip="Add Payment"
        >
          <Plus className="h-4 w-4" />
          Add payment
        </Button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {totalAmount <= 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Order total is not set. Edit the order total before recording payments.
        </p>
      )}

      <div className="-mx-3 overflow-hidden border-t border-stone-200">
        <table className="min-w-full table-fixed divide-y divide-stone-200 text-left text-sm">
          <colgroup>
            <col className="w-[21%]" />
            <col className="w-[23%]" />
            <col className="w-[39%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead className="bg-stone-50 text-left text-stone-500 border-b border-stone-200">
            <tr>
              <th className="!px-2.5 !py-1.5">Amount</th>
              <th className="!px-2.5 !py-1.5">Date</th>
              <th className="!px-2.5 !py-1.5">Remarks</th>
              <th className="!px-1.5 !py-1.5 text-center" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="!px-2.5 !py-1.5 whitespace-nowrap font-semibold text-stone-900">
                  {formatCurrency(Number(p.amount))}
                </td>
                <td className="!px-2.5 !py-1.5 whitespace-nowrap font-medium text-stone-600">
                  {formatDate(p.payment_date)}
                </td>
                <td className="!px-2.5 !py-1.5 break-words text-stone-600">
                  {p.notes || "-"}
                </td>
                <td className="!px-1.5 !py-1.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <PdfDownloadButton
                      url={`/api/orders/${orderId}/payments/${p.id}/receipt/pdf`}
                      filename={`receipt-${p.receipt_number}.pdf`}
                      tooltip="Download PDF"
                      variant="ghost"
                      className="flex h-7 w-7 items-center justify-center rounded-md border-0 p-0 shadow-none"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setEditingPayment(p);
                        setAmount(String(p.amount));
                        setDate(p.payment_date);
                        setNotes(p.notes ?? "");
                        setFormOpen(true);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md p-0"
                      tooltip="Edit payment"
                    >
                      <Pencil className="h-3.5 w-3.5 text-stone-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDelete(p)}
                      className="flex h-7 w-7 items-center justify-center rounded-md p-0"
                      tooltip="Delete payment"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="border-t border-stone-100 bg-stone-50/50 py-3 text-center text-sm text-stone-500">
            No payments recorded.
          </p>
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Payment"
        message={`Delete receipt ${pendingDelete?.receipt_number ?? ""}? This will update the paid amount and payment status.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(deletingId)}
      />

      {mounted && formOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              if (!loading) {
                setEditingPayment(null);
                setFormOpen(false);
              }
            }}
          />

          <div className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setEditingPayment(null);
                setFormOpen(false);
              }}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10 disabled:opacity-50"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              {editingPayment ? "Edit Payment" : "Add Payment"}
            </h3>

            {error && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}

            <div className="space-y-4 pr-1 flex-1">
              <Input
                label="Payment amount (Rs.)"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input
                label="Payment date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Textarea
                label="Remarks"
                rows={3}
                placeholder="Add payment remarks (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setEditingPayment(null);
                  setFormOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={loading}
                onClick={submit}
                disabled={!amount || (!editingPayment && (totalAmount <= 0 || remaining <= 0))}
              >
                {editingPayment ? "Save changes" : "Add payment"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Card>
  );
}
