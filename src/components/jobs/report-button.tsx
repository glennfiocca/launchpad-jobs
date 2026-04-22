"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import type { ApiResponse } from "@/types";
import type { ReportCategory } from "@prisma/client";

const CATEGORIES: { value: ReportCategory; label: string; description: string }[] = [
  { value: "SPAM", label: "Spam", description: "Fake or misleading listing" },
  { value: "INACCURATE", label: "Inaccurate", description: "Incorrect details or requirements" },
  { value: "OFFENSIVE", label: "Offensive", description: "Discriminatory or inappropriate content" },
  { value: "BROKEN_LINK", label: "Broken Link", description: "Apply link or external URL is broken" },
  { value: "OTHER", label: "Other", description: "Something else is wrong" },
];

interface ReportButtonProps {
  jobPublicId: string;
  variant?: "card" | "detail";
  initialReported?: boolean;
  initialReportedCategory?: ReportCategory;
}

export function ReportButton({
  jobPublicId,
  variant = "detail",
  initialReported = false,
  initialReportedCategory,
}: ReportButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(initialReported);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(
    initialReportedCategory ?? null
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();

    if (!session) {
      toast.error("Sign in to report jobs");
      return;
    }
    if (reported) {
      toast.info("You've already reported this job");
      return;
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategory || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobPublicId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, message: message.trim() || undefined }),
      });
      const data: ApiResponse<{ reported: boolean }> = await res.json();

      if (!data.success) {
        if (res.status === 409) {
          toast.info("You've already reported this job");
          setReported(true);
          setOpen(false);
        } else {
          toast.error(data.error ?? "Failed to submit report");
        }
        return;
      }

      setReported(true);
      setOpen(false);
      setMessage("");
      toast.success("Report submitted. Thank you for helping keep listings accurate.");
    } catch {
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  const buttonClass =
    variant === "card"
      ? cn(
          "p-2.5 rounded-lg transition-colors",
          reported
            ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/8"
        )
      : cn(
          "p-1.5 rounded-lg transition-colors",
          reported
            ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
            : "text-zinc-500 hover:text-white hover:bg-white/8"
        );

  const iconClass = variant === "card" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          onClick={handleOpen}
          aria-label={reported ? "Already reported" : "Report job"}
          className={buttonClass}
        >
          <Flag className={cn(iconClass, reported && "fill-current")} />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <Dialog.Title className="text-lg font-semibold text-white mb-1">
            Report this listing
          </Dialog.Title>
          <Dialog.Description className="text-sm text-zinc-400 mb-5">
            Help us maintain quality by reporting issues with this job listing.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category selection */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Select a reason
              </p>
              <div className="space-y-1.5">
                {CATEGORIES.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedCategory(value)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg border transition-colors",
                      selectedCategory === value
                        ? "border-indigo-500/50 bg-indigo-500/10 text-white"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-700"
                    )}
                  >
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Optional message */}
            <div className="space-y-1.5">
              <label htmlFor="report-message" className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Additional details (optional)
              </label>
              <textarea
                id="report-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Describe the issue..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <p className="text-xs text-zinc-600 text-right">{message.length}/1000</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!selectedCategory || submitting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-sm font-medium text-white transition-colors"
              >
                {submitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
