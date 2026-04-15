"use client";

import { useState } from "react";
import { Zap, CheckCircle, AlertTriangle, CreditCard } from "lucide-react";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import type { $Enums } from "@prisma/client";
type SubscriptionStatus = $Enums.SubscriptionStatus;

interface Props {
  creditStatus: {
    isSubscribed: boolean;
    creditsUsed: number;
    creditsRemaining: number;
    resetsAt: string;
  };
  subscriptionStatus: SubscriptionStatus;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  justUpgraded: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function BillingClient({
  creditStatus,
  subscriptionStatus,
  periodEnd,
  cancelAtPeriodEnd,
  justUpgraded,
}: Props) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const isPro = subscriptionStatus === "ACTIVE";
  const isPastDue = subscriptionStatus === "PAST_DUE";

  async function handleUpgrade() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        data?: { url: string };
      };
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      setCheckoutLoading(false);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        data?: { url: string };
      };
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch {
      setPortalLoading(false);
    }
  }

  const usedPct = Math.min(
    100,
    (creditStatus.creditsUsed / FREE_TIER_CREDITS) * 100
  );

  return (
    <div className="py-10 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Billing</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Manage your plan and application credits.
      </p>

      {/* Success banner */}
      {justUpgraded && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 mb-6">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-300">
            You&apos;re now on the Pro plan. Enjoy unlimited applications!
          </p>
        </div>
      )}

      {/* Past due banner */}
      {isPastDue && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 mb-6">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <div>
            <p className="text-sm text-red-300 font-medium">
              Payment failed
            </p>
            <p className="text-xs text-red-400/80 mt-0.5">
              Please update your payment method to keep unlimited access.
            </p>
          </div>
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="ml-auto text-xs font-medium text-red-300 hover:text-red-200 underline underline-offset-2 shrink-0"
          >
            {portalLoading ? "Loading..." : "Fix payment"}
          </button>
        </div>
      )}

      {/* Current plan card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isPro ? (
                <Zap className="w-4 h-4 text-indigo-400 fill-indigo-400" />
              ) : (
                <Zap className="w-4 h-4 text-zinc-400" />
              )}
              <span className="text-sm font-semibold text-white">
                {isPro ? "Pro Plan" : "Free Plan"}
              </span>
            </div>
            {isPro ? (
              <p className="text-xs text-zinc-400">
                Unlimited applications ·{" "}
                {cancelAtPeriodEnd && periodEnd
                  ? `Cancels ${formatDate(periodEnd)}`
                  : periodEnd
                    ? `Renews ${formatDate(periodEnd)}`
                    : "Active"}
              </p>
            ) : (
              <p className="text-xs text-zinc-400">
                {FREE_TIER_CREDITS} applications per 24 hours
              </p>
            )}
          </div>
          {isPro ? (
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg">
              $24.99/mo
            </span>
          ) : (
            <span className="text-xs font-semibold text-zinc-400 bg-white/5 border border-white/10 px-2 py-1 rounded-lg">
              Free
            </span>
          )}
        </div>

        {/* Credit meter — only for free tier */}
        {!isPro && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Applications today</span>
              <span>
                {creditStatus.creditsUsed}/{FREE_TIER_CREDITS} · resets in{" "}
                {formatTimeRemaining(creditStatus.resetsAt)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Manage subscription button */}
        {isPro && (
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mt-2"
          >
            <CreditCard className="w-4 h-4" />
            {portalLoading ? "Loading..." : "Manage subscription & invoices"}
          </button>
        )}
      </div>

      {/* Upgrade section — free users only */}
      {!isPro && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-white">
              Unlimited Applications
            </h2>
            <span className="text-base font-bold text-white">
              $24.99
              <span className="text-xs font-normal text-zinc-400">/mo</span>
            </span>
          </div>

          <ul className="space-y-2 text-sm text-zinc-300">
            {[
              "No daily application cap — apply to as many jobs as you want",
              "Full application tracking & email monitoring",
              "Cancel any time",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>

          <button
            onClick={handleUpgrade}
            disabled={checkoutLoading}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {checkoutLoading ? "Redirecting to Stripe..." : "Upgrade to Unlimited — $24.99/mo"}
          </button>

          {/* Bootstrap note */}
          <p className="text-xs text-zinc-500 text-center leading-relaxed">
            Sorry to charge — we&apos;re bootstrapping and hope to make this
            free down the line. We really appreciate your support.
          </p>
        </div>
      )}
    </div>
  );
}
