"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Edit2, X } from "lucide-react";

interface AdminNotesProps {
  recordId: string;
  table: "leads" | "quotations" | "orders";
  initialNotes: string | null;
}

export function AdminNotes({ recordId, table, initialNotes }: AdminNotesProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes || "");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  const handleCancel = useCallback(() => {
    setNotes(initialNotes || "");
    setIsEditing(false);
    setError("");
  }, [initialNotes]);

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isEditing) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        handleCancel();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, loading, handleCancel]);

  const handleSave = async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from(table)
        .update({ admin_notes: notes.trim() || null })
        .eq("id", recordId);

      if (updateError) {
        throw new Error(updateError.message || "Failed to save notes");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const openEditor = () => {
    setNotes(initialNotes || "");
    setError("");
    setIsEditing(true);
  };

  const editorModal =
    mounted && isEditing
      ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <button
              type="button"
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              onClick={loading ? undefined : handleCancel}
              aria-label="Close notes editor"
            />
            <div
              className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl animate-scale-up"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-notes-title"
            >
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h3 id="admin-notes-title" className="text-base font-bold text-stone-900">
                    Edit Notes
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
                  aria-label="Close notes editor"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <p className="mb-3 rounded-lg border border-red-100 bg-red-50 p-2 text-sm font-semibold text-red-600">
                  {error}
                </p>
              )}

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add internal notes about this booking, client requirements, or special instructions..."
                disabled={loading}
                className="min-h-[150px] w-full resize-y rounded-lg border border-stone-200 bg-stone-50/30 p-3 text-sm text-stone-800 transition-all duration-200 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
              />

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} loading={loading}>
                  Save
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Card className="!p-3 flex flex-col justify-between h-full min-h-[140px] relative overflow-hidden transition-all duration-300">
        <div>
          <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <FileText className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-stone-900">Notes</h3>
            </div>
            <button
              onClick={openEditor}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-xs cursor-pointer"
              title="Edit Notes"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="text-sm text-stone-600 leading-relaxed font-medium bg-stone-50/50 p-3 rounded-xl min-h-[60px] flex items-center justify-start">
            {initialNotes ? (
              <p className="whitespace-pre-wrap w-full">{initialNotes}</p>
            ) : (
              <p className="text-stone-400 italic text-center w-full py-2">
                No internal admin notes added yet.
              </p>
            )}
          </div>
        </div>
      </Card>
      {editorModal}
    </>
  );
}
