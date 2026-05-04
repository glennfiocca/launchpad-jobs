"use client";

import { useEffect, useState, useRef } from "react";
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
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showTooltip() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setTooltipVisible(true);
  }

  function hideTooltip() {
    hideTimer.current = setTimeout(() => setTooltipVisible(false), 150);
  }

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
      <div className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
        <Link
          href="/settings/billing"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 fill-indigo-400" />
          Pro
        </Link>
        {tooltipVisible && (
          <div
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            className="absolute bottom-full left-0 mb-2 w-48 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-400 leading-relaxed z-50 shadow-xl"
          >
            <p className="text-white font-medium mb-1">Pro Plan</p>
            <p>Unlimited applications — no daily cap.</p>
            <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-zinc-900 border-r border-b border-white/10 rotate-45" />
          </div>
        )}
      </div>
    );
  }

  const hasBonus = status.referralCredits > 0
  const isLow = status.creditsRemaining <= 3 && !hasBonus

  return (
    <div className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      <Link
        href="/settings/billing"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
          isLow
            ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            : "text-zinc-400 hover:text-zinc-300 hover:bg-white/5"
        )}
      >
        <Zap className={cn("w-3.5 h-3.5", isLow && "fill-amber-400")} />
        <span>
          {status.creditsRemaining}/{FREE_TIER_CREDITS}
          {hasBonus && (
            <span className="text-violet-400 ml-0.5">+{status.referralCredits}</span>
          )}
        </span>
      </Link>
      {tooltipVisible && (
        <div
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          className="absolute bottom-full left-0 mb-2 w-56 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-400 leading-relaxed z-50 shadow-xl"
        >
          <p className={cn("font-medium mb-1", isLow ? "text-amber-400" : "text-white")}>
            Free tier
          </p>
          <p>
            {status.creditsRemaining} of {FREE_TIER_CREDITS} daily applications remaining.
            Resets in {formatTimeRemaining(status.resetsAt)}.
          </p>
          {hasBonus && (
            <p className="mt-1 text-violet-400">
              +{status.referralCredits} bonus credit{status.referralCredits === 1 ? "" : "s"} (never expire)
            </p>
          )}
          <Link
            href="/settings/billing"
            onClick={() => setTooltipVisible(false)}
            className="mt-1.5 block text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Upgrade for unlimited →
          </Link>
          <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-zinc-900 border-r border-b border-white/10 rotate-45" />
        </div>
      )}
    </div>
  );
}
