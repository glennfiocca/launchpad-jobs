"use client";

/**
 * Pre-H1 eyebrow row: live tracker pill on the left, magenta pending-Q
 * interrupt pill on the right (only when there's at least one application
 * with unanswered questions).
 *
 * The "synced 12s ago" wording from the prototype is intentionally dropped
 * per the Phase 2 spec — we don't have a live sync timestamp surfaced, and
 * the count is what users actually need.
 */

import Link from "next/link";
import { PulseDot } from "./atoms";

interface EyebrowProps {
  totalActive: number;
  totalPendingQuestions: number;
  pendingFirstAppId: string | null;
}

export function Eyebrow({
  totalActive,
  totalPendingQuestions,
  pendingFirstAppId,
}: EyebrowProps) {
  return (
    <div className="flex items-center justify-between mb-[18px] gap-4 flex-wrap">
      {/* Left pill — pulsing dot + active-app counter */}
      <span className="inline-flex items-center gap-2 px-[11px] py-[5px] rounded-full border border-[rgba(245,244,241,0.12)] font-mono text-[11px] tracking-[0.04em] text-text-muted">
        <PulseDot />
        Tracked · {totalActive} active application
        {totalActive === 1 ? "" : "s"}
      </span>

      {/* Right pill — magenta pending-Q interrupt (uses --color-stage-interview tokens) */}
      {totalPendingQuestions > 0 && pendingFirstAppId && (
        <Link
          href={`/applications/${pendingFirstAppId}/questions`}
          // from prototype direction-a.jsx :134-148 — magenta pill, 6px count chip
          className="inline-flex items-center gap-[10px] py-[6px] pl-[6px] pr-[12px] rounded-full bg-[rgba(217,70,239,0.08)] border border-[rgba(217,70,239,0.22)] text-[var(--color-stage-interview-accent)] font-mono text-[11.5px] tracking-[0.02em] no-underline hover:bg-[rgba(217,70,239,0.12)] transition-colors"
        >
          <span className="px-2 py-[2px] rounded-full bg-[var(--color-stage-interview)] text-bg font-mono text-[10px] font-semibold tabular-nums">
            {totalPendingQuestions}
          </span>
          unanswered question{totalPendingQuestions === 1 ? "" : "s"}
          <span aria-hidden className="ml-1">
            →
          </span>
        </Link>
      )}
    </div>
  );
}
