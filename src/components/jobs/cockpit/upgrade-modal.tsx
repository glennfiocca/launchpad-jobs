"use client";

/**
 * UpgradeModal — Phase 5 editorial 402 surface.
 *
 * When the apply-pane submit returns HTTP 402 the pane silently closes
 * and this real centered modal opens. The legacy `<UpgradeModal>` in
 * `src/components/billing/upgrade-modal.tsx` stays put — it's still
 * imported by the old `<ApplyModal>` and `<JobApplyButton>`, both of
 * which Phase 6 will replace. Two side-by-side versions during the
 * transition is acceptable.
 *
 * Visual spec: editorial — Bricolage display headline, lavender
 * accents, `bg-bg-elev` surface, `border-border-strong` chrome. The
 * action card uses the same gradient as the primary Apply CTA so the
 * "upgrade" affordance reads as a continuation of the apply flow.
 */

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Clock, X, Zap } from "lucide-react";
import { FREE_TIER_CREDITS } from "@/lib/credits";
import { CheckoutForm } from "@/components/billing/checkout-form";
import { cn } from "@/lib/utils";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetsAt: Date;
}

function formatTimeRemaining(resetsAt: Date): string {
  const ms = resetsAt.getTime() - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function UpgradeModal({
  open,
  onOpenChange,
  resetsAt,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/billing/subscription", { method: "POST" });
      const data = (await res.json()) as {
        success: boolean;
        data?: { clientSecret: string; subscriptionId: string };
        error?: string;
      };
      if (data.success && data.data?.clientSecret) {
        setClientSecret(data.data.clientSecret);
      } else {
        setUpgradeError(
          data.error ?? "Something went wrong. Please try again.",
        );
        setLoading(false);
      }
    } catch {
      setUpgradeError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] w-full max-w-md -translate-x-1/2 -translate-y-1/2 mx-4",
            "bg-bg-elev border border-border-strong rounded-[16px] shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[10px] bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.25)] flex items-center justify-center">
                <Zap className="w-4 h-4 text-accent-light" />
              </div>
              <Dialog.Title className="font-display font-semibold text-[18px] tracking-[-0.02em] text-text">
                Daily limit reached
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/[0.07] transition-colors"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 space-y-4">
            <p className="text-sm text-text-muted leading-relaxed">
              You&apos;ve used all {FREE_TIER_CREDITS} of your free
              applications for today.
            </p>

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-dim uppercase tracking-[0.04em]">
              <Clock className="w-3.5 h-3.5" />
              Free tier resets in
              <span className="text-accent-lavender font-medium normal-case tracking-normal">
                {formatTimeRemaining(resetsAt)}
              </span>
            </div>

            {clientSecret ? (
              <CheckoutForm
                clientSecret={clientSecret}
                onSuccess={() => onOpenChange(false)}
                onCancel={() => setClientSecret(null)}
              />
            ) : (
              <div className="rounded-[12px] border border-[rgba(99,102,241,0.22)] bg-[rgba(99,102,241,0.06)] p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-semibold text-[15px] text-text">
                    Unlimited Applications
                  </span>
                  <span className="font-display font-semibold text-[15px] text-text">
                    $24.99
                    <span className="font-mono text-[11px] font-normal text-text-muted ml-0.5">
                      /mo
                    </span>
                  </span>
                </div>
                <p className="text-[12.5px] text-text-muted leading-relaxed">
                  Apply to as many jobs as you want, every day, with no caps.
                </p>
                {upgradeError && (
                  <p className="text-sm text-red-400 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                    {upgradeError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={loading}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-[10px]",
                    "font-display font-semibold text-[13.5px] transition-transform active:scale-[0.985]",
                    "text-bg bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0]",
                    "shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                  )}
                >
                  {loading ? "Loading..." : "Upgrade to Unlimited"}
                </button>
              </div>
            )}

            <p className="text-[11px] text-text-dim leading-relaxed text-center">
              Sorry to charge — we&apos;re bootstrapping and hope to make this
              free down the line.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
