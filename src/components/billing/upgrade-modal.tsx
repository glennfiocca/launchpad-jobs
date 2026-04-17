"use client";

import { useState } from "react";
import { X, Zap, Clock } from "lucide-react";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import { CheckoutForm } from "@/components/billing/checkout-form";

interface UpgradeModalProps {
  resetsAt: Date;
  onClose: () => void;
}

function formatTimeRemaining(resetsAt: Date): string {
  const ms = resetsAt.getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function UpgradeModal({ resetsAt, onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscription", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        data?: { clientSecret: string; subscriptionId: string };
      };
      if (data.success && data.data?.clientSecret) {
        setClientSecret(data.data.clientSecret);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-white">
              Daily limit reached
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-4">
          <p className="text-sm text-zinc-400">
            You&apos;ve used all {FREE_TIER_CREDITS} of your free applications for today.
          </p>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Clock className="w-3.5 h-3.5" />
            Free tier resets in{" "}
            <span className="text-zinc-300 font-medium">
              {formatTimeRemaining(resetsAt)}
            </span>
          </div>

          {/* Upgrade card */}
          {clientSecret ? (
            <CheckoutForm
              clientSecret={clientSecret}
              onSuccess={onClose}
              onCancel={() => setClientSecret(null)}
            />
          ) : (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-white">
                  Unlimited Applications
                </span>
                <span className="text-sm font-bold text-white">
                  $24.99
                  <span className="text-xs font-normal text-zinc-400">/mo</span>
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Apply to as many jobs as you want, every day, with no caps.
              </p>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? "Loading..." : "Upgrade to Unlimited"}
              </button>
            </div>
          )}

          {/* Bootstrap note */}
          <p className="text-xs text-zinc-600 leading-relaxed text-center">
            Sorry to charge — we&apos;re bootstrapping and hope to make this
            free down the line.
          </p>
        </div>
      </div>
    </div>
  );
}
