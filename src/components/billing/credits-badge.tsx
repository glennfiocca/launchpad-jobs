"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import type { CreditStatus } from "@/types";

export function CreditsBadge() {
  const [status, setStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json() as Promise<{ success: boolean; data?: CreditStatus }>)
      .then((json) => {
        if (json.success && json.data) {
          // resetsAt comes as a string from JSON
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
      <Link
        href="/billing"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
      >
        <Zap className="w-3.5 h-3.5 fill-indigo-400" />
        Pro
      </Link>
    );
  }

  const isLow = status.creditsRemaining <= 3;

  return (
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
  );
}
