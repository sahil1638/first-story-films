"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

type PdfDownloadButtonProps = {
  url: string;
  filename: string;
  tooltip?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  className?: string;
};

export function PdfDownloadButton({
  url,
  filename,
  tooltip = "Download PDF",
  variant = "outline",
  className,
}: PdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  async function downloadPdf() {
    setLoading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        let message = "Unable to generate PDF";
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          message = body?.error || message;
        } else {
          const body = await response.text().catch(() => "");
          message = body.trim() || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to download PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      loading={loading}
      onClick={downloadPdf}
      className={className ?? "flex h-9 w-9 items-center justify-center rounded-xl p-0"}
      tooltip={tooltip}
    >
      {!loading && <FileText className="h-4 w-4 text-stone-600" />}
    </Button>
  );
}
