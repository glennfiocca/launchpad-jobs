"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Zap, ArrowRight } from "lucide-react";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import type { ApiResponse, CreditStatus } from "@/types";

// CreditsBadge — editorial-tier pill + click-popover.
//
// Replaces the prior hover-tooltip variant. The trigger is a compact mono
// chip "{used}/{limit}" with an optional lavender "+N" bonus chip; clicking
// opens a 296px popover with daily-meter, referral-bonus line, and an
// Upgrade-to-Pro CTA. Radix Popover handles outside-click + Escape.
//
// Data source: GET /api/billing/status → { isSubscribed, creditsUsed,
// creditsRemaining, resetsAt, referralCredits }. Pro users get a separate
// "∞" trigger and "Pro · unlimited" popover.

function formatTimeRemaining(resetsAt: Date): string {
  const ms = resetsAt.getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// API response value uses ISO string for `resetsAt`; client coerces to Date.
type CreditStatusWire = Omit<CreditStatus, "resetsAt"> & { resetsAt: string };

const PILL_TRIGGER_CLASS =
  "inline-flex items-center gap-[7px] px-2.5 py-1.5 rounded-full bg-white/[0.04] " +
  "border border-white/10 text-zinc-300 font-mono text-[11.5px] font-medium " +
  "transition-colors duration-150 hover:border-white/[0.22] hover:text-text " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

const POPOVER_CONTENT_CLASS =
  "w-[296px] p-4 rounded-xl bg-bg-elev border border-white/10 " +
  "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] z-50 text-zinc-300 " +
  "font-display animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150";

export function CreditsBadge() {
  const [status, setStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then((r) => r.json() as Promise<ApiResponse<CreditStatusWire>>)
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setStatus({
            ...json.data,
            resetsAt: new Date(json.data.resetsAt),
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  if (status.isSubscribed) {
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" className={PILL_TRIGGER_CLASS} aria-label="Pro plan">
            <Zap className="w-3 h-3 text-accent-lavender" aria-hidden="true" />
            <span className="text-text">∞</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={10} className={POPOVER_CONTENT_CLASS}>
            <div className="flex items-center justify-between text-[13.5px] text-zinc-300">
              <span>Pro plan</span>
              <span className="font-mono text-text">unlimited</span>
            </div>
            <p className="mt-1.5 font-mono text-[10.5px] text-text-dim leading-snug">
              No daily cap · apply as much as you like.
            </p>
            {status.referralCredits > 0 && (
              <>
                <div className="h-px bg-white/[0.06] my-3.5" />
                <div className="flex items-center justify-between text-[13.5px]">
                  <span>Referral bonus</span>
                  <span className="font-mono text-accent-lavender">
                    +{status.referralCredits}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[10.5px] text-text-dim leading-snug">
                  Never expire · earn +10 for every signup you convert
                </p>
              </>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const bonus = status.referralCredits;
  const used = status.creditsUsed;
  const limit = FREE_TIER_CREDITS;
  const pct = Math.min(100, Math.max(0, (used / limit) * 100));

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={PILL_TRIGGER_CLASS}
          aria-label={`${used} of ${limit} daily applications used`}
        >
          <Zap className="w-3 h-3 text-accent-lavender" aria-hidden="true" />
          <span className="tabular-nums">
            {used}
            <span className="text-text-dim">/{limit}</span>
          </span>
          {bonus > 0 && (
            // Bonus chip hides at <960px per spec.
            <span className="hidden min-[960px]:inline-flex items-center px-1.5 py-px rounded-full bg-accent-lavender/[0.16] text-accent-lavender text-[10.5px] font-semibold">
              +{bonus}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} className={POPOVER_CONTENT_CLASS}>
          <div className="flex items-center justify-between text-[13.5px] text-zinc-300">
            <span>Daily applications</span>
            <span className="font-mono tabular-nums text-text">
              {used} <span className="text-text-dim">/ {limit}</span>
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-light to-accent-lavender"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] text-text-dim leading-snug">
            Resets in {formatTimeRemaining(status.resetsAt)} · daily credits don&apos;t roll over
          </p>
          <div className="h-px bg-white/[0.06] my-3.5" />
          <div className="flex items-center justify-between text-[13.5px]">
            <span>Referral bonus</span>
            <span className="font-mono text-accent-lavender">+{bonus}</span>
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] text-text-dim leading-snug">
            Never expire · earn +10 for every signup you convert
          </p>
          <Link
            href="/settings/billing"
            className="mt-3.5 flex items-center justify-between px-3 py-2.5 rounded-[9px] text-[13px] font-medium text-text transition-colors duration-150 border border-accent-light/[0.32] bg-gradient-to-b from-accent-light/[0.18] to-accent/[0.09] hover:from-accent-light/[0.24] hover:to-accent/[0.14] hover:border-accent-light/50"
          >
            <span>Upgrade to Pro for unlimited</span>
            <ArrowRight className="w-3.5 h-3.5 text-accent-lavender" aria-hidden="true" />
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
