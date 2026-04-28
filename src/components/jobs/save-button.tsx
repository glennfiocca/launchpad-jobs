"use client";

import { useState, useEffect } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import type { ApiResponse } from "@/types";

interface SaveButtonProps {
  jobId: string;
  jobPublicId: string;
  initialSaved?: boolean;
  variant?: "card" | "detail";
  onToggle?: (saved: boolean) => void;
}

interface SaveToggleResult {
  saved: boolean;
}

export function SaveButton({
  jobId,
  jobPublicId,
  initialSaved = false,
  variant = "detail",
  onToggle,
}: SaveButtonProps) {
  const { data: session } = useSession();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  // Sync internal state when the parent's source of truth changes
  // (e.g., after navigating back and savedJobIds is repopulated from the API)
  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    if (!session) {
      toast.error("Sign in to save jobs");
      return;
    }

    // Optimistic update
    const next = !saved;
    setSaved(next);
    onToggle?.(next);

    try {
      setPending(true);
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobPublicId)}/save`, {
        method: "POST",
      });
      const data: ApiResponse<SaveToggleResult> = await res.json();

      if (!data.success) {
        // Revert on failure
        setSaved(!next);
        onToggle?.(!next);
        toast.error("Failed to update saved state");
        return;
      }

      const actual = data.data?.saved ?? next;
      setSaved(actual);
      onToggle?.(actual);
      toast.success(actual ? "Job saved" : "Job removed from saved");
    } catch {
      setSaved(!next);
      onToggle?.(!next);
      toast.error("Failed to update saved state");
    } finally {
      setPending(false);
    }
  }

  if (variant === "card") {
    return (
      <button
        onClick={handleClick}
        disabled={pending}
        aria-label={saved ? "Unsave job" : "Save job"}
        className={cn(
          "p-2.5 rounded-lg transition-colors",
          saved
            ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/8"
        )}
      >
        <Bookmark
          className={cn("w-3.5 h-3.5", saved && "fill-current")}
        />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label={saved ? "Unsave job" : "Save job"}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        saved
          ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
          : "text-zinc-500 hover:text-white hover:bg-white/8"
      )}
    >
      <Bookmark className={cn("w-4 h-4", saved && "fill-current")} />
    </button>
  );
}
