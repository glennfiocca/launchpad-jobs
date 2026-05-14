"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiResponse, CreditStatus } from "@/types";

// UpgradePill — primary CTA pointing to /settings/billing.
//
// Visual: pill-shaped white-on-black inversion with an inline gradient
// "PRO" badge. Under 960px the "Upgrade" label collapses, leaving just
// the PRO badge. The pill is hidden entirely when the user is already on
// the Pro plan (status.isSubscribed === true) — that state is signaled in
// the navbar via the CreditsBadge's "∞" trigger instead.
//
// Data source: GET /api/billing/status. We render nothing until we know
// the subscription status to avoid a brief "Upgrade" flash for Pro users.

type CreditStatusWire = Omit<CreditStatus, "resetsAt"> & { resetsAt: string };

const PILL_CLASS =
  "inline-flex items-center gap-2 pl-3.5 pr-2.5 py-1.5 rounded-full " +
  "bg-text text-bg font-display text-[13px] font-semibold " +
  "transition-transform duration-150 hover:bg-white hover:-translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg " +
  "max-[960px]:pl-2.5 max-[960px]:pr-2.5";

const PRO_BADGE_CLASS =
  "font-mono text-[9.5px] font-bold tracking-wider px-1.5 py-[3px] rounded-[5px] " +
  "bg-gradient-to-r from-accent to-[#a855f7] text-white";

export function UpgradePill() {
  // null = unknown (loading), true = Pro, false = free.
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then((r) => r.json() as Promise<ApiResponse<CreditStatusWire>>)
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setIsSubscribed(json.data.isSubscribed);
        } else {
          // Treat fetch failure as "not subscribed" so we still show the CTA.
          setIsSubscribed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isSubscribed === null || isSubscribed) return null;

  return (
    <Link href="/settings/billing" className={PILL_CLASS}>
      {/* "Upgrade" label collapses under 960px, leaving just the PRO badge. */}
      <span className="max-[960px]:hidden">Upgrade</span>
      <span className={PRO_BADGE_CLASS}>PRO</span>
    </Link>
  );
}
