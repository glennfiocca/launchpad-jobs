"use client";

/**
 * 4-cell metric strip beneath the page-header H1.
 *
 * Cells: FILLED · PARTIAL · EMPTY · UPDATED. Each cell is a small editorial
 * tile — mono eyebrow on top, Bricolage value beneath, mono caption to the
 * right of the value. The strip uses a 1px gap (the hairline reveals the
 * cell separator) and wraps in a 12-px-radius card.
 *
 * The UPDATED cell replaces the prototype's STREAK cell — the schema doesn't
 * track an edit streak yet, and "updated 4s ago" is the more useful read
 * for a freshly-loaded page.
 */

import type { ReactNode } from "react";

interface MetricCellProps {
  eyebrow: string;
  value: ReactNode;
  caption: ReactNode;
}

function MetricCell({ eyebrow, value, caption }: MetricCellProps) {
  return (
    <div className="bg-bg p-[10px_12px] min-w-0">
      <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-dim">
        {eyebrow}
      </div>
      <div className="mt-1 flex items-baseline gap-[6px]">
        <span className="font-display font-medium text-[22px] text-text tracking-[-0.03em] tabular-nums truncate">
          {value}
        </span>
        <span className="font-mono text-[10px] text-text-dim truncate">
          {caption}
        </span>
      </div>
    </div>
  );
}

interface MetricStripProps {
  filledCount: number;
  partialCount: number;
  emptyCount: number;
  /** Pre-formatted "today" / "12d" / "5mo" / "2y+". Server-derived. */
  updatedAgo: string;
  /** Total number of axes (8) — surfaced so the FILLED caption can read
   *  "of 8 sections" without hard-coding. */
  totalAxes: number;
}

export function MetricStrip({
  filledCount,
  partialCount,
  emptyCount,
  updatedAgo,
  totalAxes,
}: MetricStripProps) {
  return (
    <div className="grid grid-cols-4 gap-px rounded-[12px] border border-white/10 bg-white/10 overflow-hidden">
      <MetricCell
        eyebrow="FILLED"
        value={filledCount}
        caption={`of ${totalAxes} sections`}
      />
      <MetricCell
        eyebrow="PARTIAL"
        value={partialCount}
        caption="in progress"
      />
      <MetricCell
        eyebrow="EMPTY"
        value={emptyCount}
        caption="left to add"
      />
      <MetricCell
        eyebrow="UPDATED"
        value={updatedAgo}
        caption="ago"
      />
    </div>
  );
}
