"use client";

/**
 * MobileHeader — sub-md (<768px) fallback for the profile page header.
 *
 * Per locked spec (Q4): NO sigil on mobile. Stack of:
 *   - Name (Bricolage, large)
 *   - Subtitle
 *   - 2x2 grid of the 4 metric cells (FILLED · PARTIAL · EMPTY · UPDATED)
 *   - Thin progress bar at total completion %
 *   - Next-best-action chip
 *
 * The chip rail (tab nav) is rendered separately inside <ProfileTabs>, so
 * this component owns only the header chrome.
 */

import type { PerSectionScore } from "@/lib/profile/completeness";
import { NextBestActionChip } from "./next-best-action-chip";

interface MobileHeaderProps {
  firstName: string | null;
  perSection: PerSectionScore;
  totalPct: number;
  filledCount: number;
  partialCount: number;
  emptyCount: number;
  updatedAgo: string;
  isStale: boolean;
}

interface MobileMetricCellProps {
  eyebrow: string;
  value: number | string;
  caption: string;
}

function MobileMetricCell({
  eyebrow,
  value,
  caption,
}: MobileMetricCellProps) {
  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <div className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-text-dim">
        {eyebrow}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-display font-medium text-[18px] tracking-[-0.025em] text-text tabular-nums">
          {value}
        </span>
        <span className="font-mono text-[9.5px] text-text-dim">
          {caption}
        </span>
      </div>
    </div>
  );
}

export function MobileHeader({
  firstName,
  perSection,
  totalPct,
  filledCount,
  partialCount,
  emptyCount,
  updatedAgo,
  isStale,
}: MobileHeaderProps) {
  const greeting = firstName ? `${firstName}'s` : "Your";

  return (
    <div className="flex flex-col gap-4 md:hidden">
      <div>
        <h1 className="font-display font-medium text-text leading-[0.98] tracking-[-0.04em] text-[40px]">
          {greeting}{" "}
          <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
            profile,
          </em>
          <br />
          drawn from{" "}
          <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
            you.
          </em>
        </h1>
        <p className="mt-2 text-[13.5px] text-text-muted leading-relaxed max-w-[420px]">
          Each section is one dimension of you. Fill it once — Pipeline
          re-uses every field at apply-time.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MobileMetricCell
          eyebrow="FILLED"
          value={filledCount}
          caption={`of ${8} sections`}
        />
        <MobileMetricCell
          eyebrow="PARTIAL"
          value={partialCount}
          caption="in progress"
        />
        <MobileMetricCell
          eyebrow="EMPTY"
          value={emptyCount}
          caption="left to add"
        />
        <MobileMetricCell
          eyebrow="UPDATED"
          value={updatedAgo}
          caption="ago"
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-dim tabular-nums">
          {totalPct}% complete
        </span>
        <div className="flex-1 h-[3px] rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-lavender)] via-[var(--color-stage-interview)] to-[var(--color-accent-cyan)] transition-all"
            style={{
              width: `${Math.max(0, Math.min(100, totalPct))}%`,
            }}
          />
        </div>
      </div>

      <NextBestActionChip
        perSection={perSection}
        totalPct={totalPct}
        updatedAgo={updatedAgo}
        isStale={isStale}
      />
    </div>
  );
}
