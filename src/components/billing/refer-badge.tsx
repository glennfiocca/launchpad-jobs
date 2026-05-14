"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Gift } from "lucide-react";
import type { ApiResponse } from "@/types";
import type { ReferralDashboardData } from "@/lib/referral";

// ReferBadge — editorial-tier ghost pill + click-popover.
//
// Trigger: gift icon + "Refer" label (hidden under 1080px) + lavender mono
// "+10" pip. Popover: copy-able share link + 2-cell stats grid (signups +
// bonus earned). Data source: GET /api/referral → ReferralDashboardData.
//
// Mock display shape: { link, signups, bonusEarned }. We derive:
//   link        = referralLink (strip protocol for display)
//   signups     = totalConverted (only conversions count as paid signups)
//   bonusEarned = totalCreditsEarned

interface DisplayShape {
  /** Full URL incl. protocol for clipboard write. */
  url: string;
  /** Protocol-stripped, for human display in the link row. */
  display: string;
  signups: number;
  bonusEarned: number;
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const TRIGGER_CLASS =
  "inline-flex items-center gap-[7px] px-3 py-1.5 rounded-full bg-transparent " +
  "border border-white/10 text-zinc-300 font-display text-[13px] font-medium " +
  "transition-colors duration-150 hover:border-white/[0.22] hover:text-text " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

const POPOVER_CONTENT_CLASS =
  "w-[296px] p-4 rounded-xl bg-bg-elev border border-white/10 " +
  "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] z-50 text-zinc-300 " +
  "font-display animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150";

export function ReferBadge() {
  const [data, setData] = useState<DisplayShape | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referral")
      .then((r) => r.json() as Promise<ApiResponse<ReferralDashboardData>>)
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setData({
            url: json.data.referralLink,
            display: stripProtocol(json.data.referralLink),
            signups: json.data.totalConverted,
            bonusEarned: json.data.totalCreditsEarned,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  async function copy(): Promise<void> {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context, denied permission, etc.).
      // Silently ignore — the URL is still visible in the popover.
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={TRIGGER_CLASS} aria-label="Refer a friend">
          <Gift className="w-3.5 h-3.5 text-accent-lavender" aria-hidden="true" />
          {/* Label hides under 1080px per spec. */}
          <span className="hidden min-[1080px]:inline">Refer</span>
          <span className="font-mono text-[10.5px] font-semibold text-accent-lavender">
            +10
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} className={POPOVER_CONTENT_CLASS}>
          <h4 className="text-[14.5px] font-semibold text-text tracking-tight mb-1.5">
            Earn +10 credits per signup
          </h4>
          <p className="text-[12.5px] text-text-muted leading-snug mb-3">
            Share your link. Every friend who signs up adds 10 bonus credits to your
            account — they never expire.
          </p>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/[0.35] border border-white/[0.08] font-mono text-[11.5px] text-accent-lavender">
            <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {data.display}
            </span>
            <button
              type="button"
              onClick={copy}
              className="px-1.5 py-0.5 rounded-[5px] text-[11px] text-text-dim hover:text-text hover:bg-white/[0.06] transition-colors duration-150"
              aria-label={copied ? "Link copied" : "Copy referral link"}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                Signups
              </div>
              <div className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-tight text-text">
                {data.signups}
              </div>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                Bonus earned
              </div>
              <div className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-tight text-accent-lavender">
                +{data.bonusEarned}
              </div>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
