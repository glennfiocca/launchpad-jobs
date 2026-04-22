"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
  jobPublicId: string;
  jobTitle: string;
  companyName: string;
  variant?: "card" | "detail";
}

export function ShareButton({
  jobPublicId,
  jobTitle,
  companyName,
  variant = "detail",
}: ShareButtonProps) {
  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    const url = `${window.location.origin}/jobs?job=${encodeURIComponent(jobPublicId)}`;
    const shareData: ShareData = {
      title: `${jobTitle} at ${companyName}`,
      text: `Check out this job: ${jobTitle} at ${companyName}`,
      url,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: unknown) {
        // User cancelled — not an error
        if (err instanceof Error && err.name === "AbortError") return;
        // Fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  if (variant === "card") {
    return (
      <button
        onClick={handleClick}
        aria-label="Share job"
        className={cn(
          "p-2.5 rounded-lg transition-colors",
          "text-zinc-500 hover:text-zinc-300 hover:bg-white/8"
        )}
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Share job"
      className="p-1.5 rounded-lg transition-colors text-zinc-500 hover:text-white hover:bg-white/8"
    >
      <Share2 className="w-4 h-4" />
    </button>
  );
}
