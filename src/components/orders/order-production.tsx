"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Factory, Pencil, Phone, Plus, Trash2, User, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { addProductionJob, deleteProductionJob, updateProductionJob } from "@/lib/actions/orders";
import { formatCurrency } from "@/lib/utils";

type Agency = {
  id: string;
  company_name: string;
  person_name: string;
  contact_number: string;
};

type ProductionJob = {
  id: string;
  agency_id: string;
  service_id: string;
  payable_amount: number;
  status: string;
  agencies?: {
    company_name: string;
    person_name: string | null;
    contact_number: string | null;
  } | null;
};

const JOB_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const JOB_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
};

const JOB_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

export function OrderProduction({
  orderId,
  orderServices,
  agencies,
  services,
  jobs,
}: {
  orderId: string;
  orderServices: { id: string; service_id: string }[];
  agencies: Agency[];
  services: { id: string; name: string }[];
  jobs: ProductionJob[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [agencyId, setAgencyId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [payable, setPayable] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductionJob | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<ProductionJob | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
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

  const serviceMap = new Map(services.map((s) => [s.id, s.name]));
  const selectedAgency = agencies.find((agency) => agency.id === agencyId);
  const totalPayable = jobs.reduce((sum, job) => sum + Number(job.payable_amount || 0), 0);
  const orderServiceOptions = orderServices.map((os) => ({
    value: os.service_id,
    label: serviceMap.get(os.service_id) ?? os.service_id,
  }));

  function closeForm() {
    setFormOpen(false);
    setEditingJob(null);
    setAgencyId("");
    setServiceId("");
    setPayable("");
  }

  async function addJob(e: React.FormEvent) {
    e.preventDefault();
    const payableAmount = Number(payable);
    if (!agencyId || !serviceId || !Number.isFinite(payableAmount) || payableAmount <= 0) {
      alert("Select agency, service, and enter a valid payable amount.");
      return;
    }

    setLoading(true);
    try {
      if (editingJob) {
        await updateProductionJob(editingJob.id, orderId, agencyId, serviceId, payableAmount, editingJob.status);
      } else {
        await addProductionJob(orderId, agencyId, serviceId, payableAmount);
      }
      closeForm();
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      await deleteProductionJob(pendingDelete.id, orderId);
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete production job");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="!p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Factory className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-base text-stone-900">Production Process</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </span>
          <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
            {formatCurrency(totalPayable)}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setEditingJob(null);
              setAgencyId("");
              setServiceId("");
              setPayable("");
              setFormOpen(true);
            }}
            className="flex items-center gap-1.5"
            tooltip="Add Job"
          >
            <Plus className="h-4 w-4" />
            Add Job
          </Button>
        </div>
      </div>

      <div className="-mx-3 overflow-hidden border-t border-stone-200">
        <table className="min-w-full table-fixed divide-y divide-stone-200 text-left text-sm">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[23%]" />
            <col className="w-[17%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-stone-50 text-xs uppercase tracking-wider text-stone-500 border-b border-stone-200">
            <tr>
              <th>Agency</th>
              <th>Order Service</th>
              <th>Payable</th>
              <th>Status</th>
              <th className="text-center" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="break-words font-semibold text-stone-900">
                  {job.agencies?.company_name ?? "Agency"}
                </td>
                <td className="break-words font-semibold text-stone-900">
                  {serviceMap.get(job.service_id) ?? job.service_id}
                </td>
                <td className="whitespace-nowrap font-bold text-stone-900">
                  {formatCurrency(Number(job.payable_amount))}
                </td>
                <td>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase leading-none ${
                      JOB_STATUS_CLASSES[job.status] ?? "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {JOB_STATUS_LABELS[job.status] ?? job.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td>
                  <div className="flex justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingJob(job);
                        setAgencyId(job.agency_id);
                        setServiceId(job.service_id);
                        setPayable(String(job.payable_amount));
                        setFormOpen(true);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg p-0"
                      tooltip="Edit job"
                    >
                      <Pencil className="h-3.5 w-3.5 text-stone-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDelete(job)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg p-0"
                      tooltip="Delete job"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <p className="border-t border-stone-100 bg-stone-50/50 py-4 text-center text-sm text-stone-500">
            No production jobs yet.
          </p>
        )}
      </div>

      {mounted && formOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={loading ? undefined : closeForm}
          />
          <form
            onSubmit={addJob}
            className="relative z-10 w-full max-w-xl transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={closeForm}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
              disabled={loading}
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="mb-6 text-xl font-bold text-stone-900 leading-6">
              {editingJob ? "Edit Production Job" : "Add Production Job"}
            </h3>

            <div className="grid gap-4">
              <Select
                label="Agency"
                required
                placeholder="Select agency..."
                options={agencies.map((agency) => ({
                  value: agency.id,
                  label: `${agency.company_name} (${agency.person_name})`,
                }))}
                value={agencyId}
                onChange={(e) => setAgencyId(e.target.value)}
              />
              <Select
                label="Order Service"
                required
                placeholder="Select service..."
                options={orderServiceOptions}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              />
              <Input
                label="Payable Amount"
                required
                type="number"
                min={1}
                value={payable}
                onChange={(e) => setPayable(e.target.value)}
              />
              {editingJob && (
                <Select
                  label="Status"
                  required
                  options={JOB_STATUS_OPTIONS}
                  value={editingJob.status}
                  onChange={(e) => setEditingJob({ ...editingJob, status: e.target.value })}
                />
              )}
            </div>

            {selectedAgency && (
              <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">Agency Details</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium text-stone-500">Company</p>
                    <p className="mt-1 font-semibold text-stone-900">{selectedAgency.company_name}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                    <div>
                      <p className="text-xs font-medium text-stone-500">Person</p>
                      <p className="mt-1 font-semibold text-stone-900">{selectedAgency.person_name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                    <div>
                      <p className="text-xs font-medium text-stone-500">Contact</p>
                      <p className="mt-1 font-semibold text-stone-900">{selectedAgency.contact_number}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {orderServiceOptions.length === 0 && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                No order services found. Add services to the order before creating production jobs.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-5">
              <Button type="button" variant="outline" onClick={closeForm} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" loading={loading} disabled={!agencyId || !serviceId || !payable || orderServiceOptions.length === 0}>
                {editingJob ? "Save Changes" : "Save Job"}
              </Button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Production Job"
        message="Delete this production job? The linked accounting expense entry will also be removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={Boolean(deletingId)}
      />
    </Card>
  );
}
