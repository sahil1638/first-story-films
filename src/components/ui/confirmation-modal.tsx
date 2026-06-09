"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info" | "primary";
  loading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
}: ConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state on client to prevent server-side document references (SSR safe)
  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => setMounted(false);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const iconColors = {
    danger: "bg-red-50 text-red-600 ring-red-50/50",
    warning: "bg-amber-50 text-amber-600 ring-amber-50/50",
    info: "bg-blue-50 text-blue-600 ring-blue-50/50",
    primary: "bg-stone-50 text-stone-600 ring-stone-50/50",
  };

  const confirmColors = {
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-red-600/10",
    warning: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/10",
    info: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/10",
    primary: "bg-stone-900 hover:bg-stone-850 text-white shadow-stone-950/10",
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal Box */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-sm transform overflow-hidden rounded-xl border border-stone-200 bg-white p-4 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        {!loading && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer focus:outline-none"
            aria-label="Close dialog"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}

        {/* Modal Content */}
        <div className="flex flex-col items-center text-center">
          {/* Glowing Icon Container */}
          <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-full ring-4 animate-bounce-subtle", iconColors[variant])}>
            <HelpCircle className="h-5 w-5" />
          </div>

          <h3 className="text-base font-semibold text-stone-900 leading-5">
            {title}
          </h3>
          
          <div className="mt-1.5">
            <p className="text-sm text-stone-600 leading-5 font-medium">
              {message}
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onClose}
            className="w-full sm:w-auto rounded-lg cursor-pointer"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            loading={loading}
            onClick={onConfirm}
            className={cn("w-full sm:w-auto rounded-lg px-5 py-2 shadow-md transition-all active:scale-95 duration-150 font-semibold cursor-pointer", confirmColors[variant])}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
