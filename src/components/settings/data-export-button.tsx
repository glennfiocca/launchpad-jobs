"use client";

// "Download my data" trigger — fetches /api/account/data-export, materializes
// the response Blob, and forces a download. Handles 429 (rate-limit) and 413
// (over-cap) with explicit toasts so the user understands the failure mode.

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

function extractFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  // Match filename="..." (quoted form is what our route emits).
  const match = disposition.match(/filename="([^"]+)"/i);
  return match ? match[1] : null;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer the revoke so Safari has time to finish the navigation.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataExportButton() {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/data-export", { method: "GET" });

      if (res.status === 429) {
        toast.error("Export available once per hour. Try again later.");
        return;
      }
      if (res.status === 413) {
        toast.error("Export too large. Contact support to request a copy.");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Export failed");
      }

      const blob = await res.blob();
      const filename =
        extractFilename(res.headers.get("content-disposition")) ??
        `pipeline-export-${new Date().toISOString().slice(0, 10)}.json`;
      triggerBrowserDownload(blob, filename);
      toast.success("Export downloaded");
    } catch (err) {
      console.error("[data-export-button] failed:", err);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition-colors"
    >
      {submitting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      {submitting ? "Preparing…" : "Download my data"}
    </button>
  );
}
