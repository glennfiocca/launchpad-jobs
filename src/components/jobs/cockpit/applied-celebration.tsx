"use client";

/**
 * AppliedCelebration — Phase 5 success screen.
 *
 * Replaces the apply pane in the right-column slot after a
 * successful POST /api/applications. Per the locked spec:
 *
 *   - Indigo radial-gradient background; same `bg-bg-elev` chrome
 *     as JobDetail/ApplyPane so the three pane variants feel like a
 *     family.
 *   - 84×84 glowing check (lucide `<CheckCircle2>`).
 *   - "Filed to {company}." in Bricolage with the company name as a
 *     lavender upright `<em>`.
 *   - 5-step mini stage strip with APPLIED highlighted using the
 *     `--color-stage-applied` token. Other stages dim to ~13%.
 *   - Primary white CTA "Continue browsing" → parent clears state.
 *   - Ghost "View in dashboard" → `/dashboard?app=ID` deep link.
 *
 * Source: manifold-prototype.jsx lines 2092-2208.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobWithCompany } from "@/types";

interface AppliedCelebrationProps {
  job: JobWithCompany;
  applicationId: string;
  onContinue: () => void;
}

// Stage palette from globals.css. Kept inline as RGB-with-alpha so we
// can compute the dimmed-out variants without spinning up a separate
// color-utility helper. Order matches the dashboard pipeline.
const STAGES: ReadonlyArray<{ label: string; color: string; here: boolean }> = [
  { label: "APPLIED", color: "#6366f1", here: true },
  { label: "REVIEW", color: "#8b5cf6", here: false },
  { label: "PHONE", color: "#a855f7", here: false },
  { label: "INTERV", color: "#d946ef", here: false },
  { label: "OFFER", color: "#22d3ee", here: false },
];

export function AppliedCelebration({
  job,
  applicationId,
  onContinue,
}: AppliedCelebrationProps) {
  return (
    <div
      data-testid="applied-celebration"
      className={cn(
        "relative h-full bg-bg-elev border border-[rgba(99,102,241,0.22)] rounded-[14px]",
        "overflow-hidden flex flex-col items-center justify-center text-center",
        "px-8 py-10",
      )}
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 30%, rgba(99,102,241,0.15) 0%, transparent 60%)",
      }}
    >
      {/* Glowing check */}
      <div
        className={cn(
          "w-[84px] h-[84px] rounded-full",
          "border border-[rgba(99,102,241,0.4)] bg-[rgba(99,102,241,0.13)]",
          "flex items-center justify-center mb-6",
        )}
        style={{ boxShadow: "0 0 60px rgba(99,102,241,0.33)" }}
      >
        <CheckCircle2
          className="w-9 h-9"
          style={{ color: "var(--color-accent-light)" }}
          strokeWidth={1.5}
        />
      </div>

      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-stage-applied-accent)]">
        Stage · Applied
      </span>

      <h1
        className={cn(
          "mt-2.5 font-display font-semibold leading-[1.05] tracking-[-0.035em]",
          "text-[30px] text-text [text-wrap:balance] max-w-[360px]",
        )}
      >
        Filed to{" "}
        <em className="not-italic font-medium text-accent-lavender">
          {job.company.name}.
        </em>
      </h1>

      <p className="mt-3 text-[13.5px] leading-[1.55] text-text-muted max-w-[360px] [text-wrap:pretty]">
        We&apos;ll track status updates automatically and notify you the
        second a recruiter replies.
      </p>

      {/* Mini stage strip */}
      <div className="w-full max-w-[380px] mt-7">
        <div className="flex items-center gap-[5px] font-mono text-[10px]">
          {STAGES.map(({ label, color, here }) => (
            <div key={label} className="flex-1 text-center">
              <div
                className="h-[5px] rounded-full"
                style={{
                  background: here ? color : `${color}22`,
                  boxShadow: here ? `0 0 8px ${color}` : "none",
                }}
              />
              <div
                className="mt-1.5 tracking-[0.04em]"
                style={{
                  color: here ? color : "var(--color-text-dim)",
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className={cn(
            "inline-flex items-center justify-center py-2.5 px-6 rounded-[11px]",
            "font-display font-semibold text-[13.5px] transition-transform active:scale-[0.985]",
            "text-bg bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0]",
            "shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]",
          )}
        >
          Continue browsing
        </button>
        <Link
          href={`/dashboard?app=${encodeURIComponent(applicationId)}`}
          className={cn(
            "inline-flex items-center justify-center py-2 px-3 rounded-[10px]",
            "text-[12.5px] font-medium text-text-muted hover:text-text",
            "transition-colors",
          )}
        >
          View in dashboard →
        </Link>
      </div>
    </div>
  );
}
