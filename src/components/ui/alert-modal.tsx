"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, X } from "lucide-react";
import { Button } from "./button";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export function AlertModal({
  isOpen,
  onClose,
  title = "Validation Notice",
  message,
}: AlertModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state on client to prevent server-side document references (SSR safe)
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Close on Escape key press or Enter key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape" || e.key === "Enter") {
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

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      {/* Backdrop with elegant blur */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl transition-all duration-300 scale-100 opacity-100 animate-scale-up text-stone-900"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Content */}
        <div className="flex flex-col items-center text-center mt-2">
          {/* Stunning glowing icon container */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-8 ring-amber-50/50 mb-4 animate-bounce-subtle">
            <AlertCircle className="h-6 w-6" />
          </div>

          <h3 className="text-lg font-semibold text-stone-900 leading-6 mb-2">
            {title}
          </h3>
          
          <div className="mt-2">
            <p className="text-sm text-stone-600 leading-relaxed font-medium">
              {message}
            </p>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="primary"
            onClick={onClose}
            className="w-full sm:w-auto px-8 py-2 bg-stone-900 text-white hover:bg-stone-850 rounded-xl transition-all shadow-md active:scale-95 duration-150"
          >
            Okay, got it
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
