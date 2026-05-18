"use client";

/**
 * Pre-H1 eyebrow row: live tracker pill on the left, magenta
 * "status updates this week" informational chip on the right.
 *
 * The chip surfaces a consolidated "where are we at" signal — recruiter-
 * driven status changes the user might not have noticed yet. It's
 * informational, not a CTA: rendered as a <span>, no arrow, no link.
 * Hidden entirely when the count is zero.
 *
 * Replaces the previous "unanswered questions" interrupt pill, which was
 * misleading (it counted optional ATS fields like "Website (optional)")
 * and framed user-facing apps as "blocked" when they aren't.
 */

import { PulseDot } from "./atoms";

interface EyebrowProps {
  totalActive: number;
  recentStatusUpdateCount: number;
}

export function Eyebrow({
  totalActive,
  recentStatusUpdateCount,
}: EyebrowProps) {
  return (
    <div className="flex items-center justify-between mb-[18px] gap-4 flex-wrap">
      {/* Left pill — pulsing dot + active-app counter */}
      <span className="inline-flex items-center gap-2 px-[11px] py-[5px] rounded-full border border-[rgba(245,244,241,0.12)] font-mono text-[11px] tracking-[0.04em] text-text-muted">
        <PulseDot />
        Tracked · {totalActive} active application
        {totalActive === 1 ? "" : "s"}
      </span>

      {/* Right chip — informational status-updates signal. Same magenta
          visual treatment as the previous interrupt pill (it lives in the
          same slot) but rendered as a non-link span with no arrow. */}
      {recentStatusUpdateCount > 0 && (
        <span className="inline-flex items-center gap-[10px] py-[6px] pl-[6px] pr-[12px] rounded-full bg-[rgba(217,70,239,0.08)] border border-[rgba(217,70,239,0.22)] text-[var(--color-stage-interview-accent)] font-mono text-[11.5px] tracking-[0.02em]">
          <span className="px-2 py-[2px] rounded-full bg-[var(--color-stage-interview)] text-bg font-mono text-[10px] font-semibold tabular-nums">
            {recentStatusUpdateCount}
          </span>
          status update{recentStatusUpdateCount === 1 ? "" : "s"} this week
        </span>
      )}
    </div>
  );
}
