"use client";

/**
 * Vertical journey timeline shown in the right column of an expanded row.
 * Entries are sorted ascending (oldest first) — the server fetches DESC so
 * the caller flips before passing in. Last node gets a colored ring per
 * prototype direction-a.jsx :411.
 */

import type { ApplicationStatus } from "@prisma/client";
import { timeAgo } from "@/lib/utils";
import { triggerLabel } from "@/lib/styles";
import { stageColor, stageLabel } from "./stage-tokens";

export interface JourneyEntry {
  readonly id: string;
  readonly toStatus: ApplicationStatus;
  readonly createdAt: Date;
  readonly triggeredBy: string;
}

interface JourneyTimelineProps {
  entries: ReadonlyArray<JourneyEntry>;
}

export function JourneyTimeline({ entries }: JourneyTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-text-dim text-[12.5px] font-mono">
        No history yet.
      </p>
    );
  }

  return (
    <div className="relative pl-[14px]">
      {/* Vertical guide line — from prototype direction-a.jsx :404 */}
      <div
        aria-hidden
        className="absolute left-1 top-[6px] bottom-[6px] w-px bg-white/8"
      />
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const color = stageColor(entry.toStatus);
        return (
          <div
            key={entry.id}
            className="relative"
            style={{ paddingBottom: isLast ? 0 : 14 }}
          >
            {/* 9px dot at left:-14, top:4. Last node gains a 3px color ring. */}
            <span
              aria-hidden
              className="absolute w-[9px] h-[9px] rounded-full"
              style={{
                left: -14,
                top: 4,
                background: color,
                // from prototype direction-a.jsx :411 — `${color}33` = 20% alpha
                boxShadow: isLast ? `0 0 0 3px ${color}33` : "none",
              }}
            />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-text font-medium">
                {stageLabel(entry.toStatus)}
              </span>
              <span className="font-mono text-[10.5px] text-text-dim">
                {timeAgo(entry.createdAt)}
              </span>
            </div>
            <div className="font-mono text-[10.5px] text-[#52525b] mt-[2px]">
              via {triggerLabel(entry.triggeredBy)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
