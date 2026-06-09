"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { updateProductionJobStatus } from "@/lib/actions/orders";
import { formatCurrency } from "@/lib/utils";
import type { ProductionJobStatus } from "@/types/database";

interface ProductionJobWithOrder {
  id: string;
  order_id: string;
  agency_id: string;
  service_id: string;
  payable_amount: number;
  status: ProductionJobStatus;
  created_at: string;
  agencies?: { company_name: string };
  orders?: { id: string; couple_name: string };
  services?: { name: string };
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const STATUS_COLORS: Record<ProductionJobStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  done: "bg-green-50 text-green-700 border-green-200",
};

export function ProductionList({ jobs }: { jobs: ProductionJobWithOrder[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filteredJobs = filterStatus === "all" ? jobs : jobs.filter((j) => j.status === filterStatus);

  async function handleStatusChange(jobId: string, newStatus: string, orderId: string) {
    setError("");
    setLoadingId(jobId);
    try {
      await updateProductionJobStatus(jobId, newStatus, orderId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update job status");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 leading-none">Production Process</h1>
          <p className="mt-1.5 text-sm text-stone-500">Manage all production jobs across orders.</p>
        </div>
      </div>

      <Card className="text-stone-900">

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-6 px-4">
        <Select
          label="Filter by Status"
          options={[
            { value: "all", label: "All Jobs" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In Progress" },
            { value: "done", label: "Done" },
          ]}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-48"
        />
      </div>

      <div className="space-y-2 px-4 pb-4">
        {filteredJobs.length === 0 ? (
          <p className="py-4 text-center text-stone-500">No production jobs found.</p>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col gap-3 rounded-lg border border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-stone-900">
                    {job.agencies?.company_name}
                  </p>
                  <span className="text-stone-400">·</span>
                  <p className="text-stone-700">{job.services?.name}</p>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  Order: <span className="font-medium">{job.orders?.couple_name}</span> · Amount:{" "}
                  <span className="font-medium">{formatCurrency(Number(job.payable_amount))}</span>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Badge
                  className={`uppercase ${
                    STATUS_COLORS[job.status] || "bg-stone-50 text-stone-700 border-stone-200"
                  }`}
                >
                  {job.status.replace(/_/g, " ").toUpperCase()}
                </Badge>
                <Select
                  options={STATUS_OPTIONS}
                  value={job.status}
                  onChange={(e) =>
                    handleStatusChange(job.id, e.target.value, job.order_id)
                  }
                  className="w-40"
                  disabled={loadingId === job.id}
                />
                {loadingId === job.id && (
                  <Badge className="bg-stone-100 text-stone-600">Saving...</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  </div>
  );
}
