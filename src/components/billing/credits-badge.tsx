"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import type { CreditStatus } from "@/types";

function formatTimeRemaining(resetsAt: Date): string {
  const ms = resetsAt.getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CreditsBadge() {
  const [status, setStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json() as Promise<{ success: boolean; data?: CreditStatus }>)
      .then((json) => {
        if (json.success && json.data) {
          setStatus({
            ...json.data,
            resetsAt: new Date(json.data.resetsAt),
          });
        }
      })
      .catch(() => undefined);
  }, []);

  if (!status) return null;

  if (status.isSubscribed) {
    return (
      <div className="relative group">
        <Link
          href="/billing"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 fill-indigo-400" />
          Pro
        </Link>
        <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-400 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
          <p className="text-white font-medium mb-1">Pro Plan</p>
          <p>Unlimited applications — no daily cap.</p>
        </div>
      </div>
    );
  }

  const isLow = status.creditsRemaining <= 3;
  const tooltipText = isLow
    ? `Only ${status.creditsRemaining} application${status.creditsRemaining === 1 ? "" : "s"} left today. Resets in ${formatTimeRemaining(status.resetsAt)}.`
    : `${status.creditsRemaining} of ${FREE_TIER_CREDITS} free applications remaining today. Resets in ${formatTimeRemaining(status.resetsAt)}.`;

  return (
    <div className="relative group">
      <Link
        href="/billing"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
          isLow
            ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            : "text-zinc-400 hover:text-zinc-300 hover:bg-white/5"
        )}
      >
        <Zap className={cn("w-3.5 h-3.5", isLow && "fill-amber-400")} />
        {status.creditsRemaining}/{FREE_TIER_CREDITS} left
      </Link>
      <div className="absolute top-full right-0 mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-400 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
        <p className={cn("font-medium mb-1", isLow ? "text-amber-400" : "text-white")}>
          Free tier
        </p>
        <p>{tooltipText}</p>
        <p className="mt-1.5 text-indigo-400">Upgrade for unlimited →</p>
      </div>
    </div>
  );
}
