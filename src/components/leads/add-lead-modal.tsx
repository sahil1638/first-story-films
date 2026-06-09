"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { PublicLeadForm } from "@/components/leads/public-lead-form";

export function AddLeadModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function reset() {
    setOpen(false);
  }

  function handleSuccess() {
    reset();
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        tooltip="Add Lead"
        className="cursor-pointer font-semibold bg-amber-600 hover:bg-amber-700 text-white"
      >
        <Plus className="h-4 w-4 mr-1" /> Add Lead
      </Button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
          {/* Backdrop with blur */}
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={reset}
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
              onClick={reset}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none z-10"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <h3 className="text-xl font-bold text-stone-900 leading-6 mb-4">
              Add New Manual Lead
            </h3>

            {/* Form Fields - Scrollable wrapper */}
            <div className="overflow-y-auto pr-1 flex-1">
              <PublicLeadForm
                isDashboard={true}
                onSuccess={handleSuccess}
                onCancel={reset}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
