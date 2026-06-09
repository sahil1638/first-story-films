"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, X } from "lucide-react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { deleteLead } from "@/lib/actions/leads";
import { PublicLeadForm } from "@/components/leads/public-lead-form";

export function LeadRowActions({ lead }: { lead: any }) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (editConfirmOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [editConfirmOpen]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLead(lead.id);
      setDeleteConfirmOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete lead");
    } finally {
      setDeleting(false);
    }
  }

  function handleEditSuccess() {
    setEditConfirmOpen(false);
    router.refresh();
  }

  const formattedLead = lead
    ? {
        ...lead,
        function_days: (lead.lead_function_days ?? []).map((fd: any) => ({
          day_index: fd.day_index,
          day_date: fd.day_date,
          first_event_id: fd.first_event_id || "",
          second_event_id: fd.second_event_id || "",
          service_ids: (fd.lead_function_day_services ?? []).map((s: any) => s.service_id),
        })),
      }
    : undefined;

  return (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditConfirmOpen(true)}
        tooltip="Edit Lead"
        className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
      >
        <Pencil className="h-4 w-4 text-stone-600 hover:text-amber-700 transition-colors" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDeleteConfirmOpen(true)}
        tooltip="Delete Lead"
        className="h-7 w-7 p-0 flex items-center justify-center rounded-lg"
      >
        <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700 transition-colors" />
      </Button>

      {/* Edit Modal (Portal-escaped) */}
      {mounted && editConfirmOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in text-left">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setEditConfirmOpen(false)}
          />

          {/* Modal Box */}
          <div
            className="relative z-10 w-full max-w-2xl transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900 flex flex-col max-h-[90vh]"
            role="dialog"
            aria-modal="true"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setEditConfirmOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Edit Lead details
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1">
              <PublicLeadForm
                isDashboard={true}
                initialData={formattedLead}
                onSuccess={handleEditSuccess}
                onCancel={() => setEditConfirmOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Lead"
        message={`Are you sure you want to permanently delete the lead for "${lead.couple_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
