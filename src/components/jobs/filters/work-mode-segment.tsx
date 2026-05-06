"use client";

import { cn } from "@/lib/utils";
import { WORK_MODE_OPTIONS, WORK_MODE_LABELS } from "@/lib/validations/jobs";
import type { JobFacets } from "@/types";

interface WorkModeSegmentProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** When set, renders a small uppercase label before the first chip. */
  inlineLabel?: string;
  facets?: JobFacets["workModes"];
  /** When true, chips do not wrap (caller is expected to provide overflow-x-auto). */
  nowrap?: boolean;
}

/**
 * 3-way Work-mode filter rendered as a chip strip:
 *
 *   [ Remote (n) | Hybrid (n) | On-site (n) ]
 *
 * Click an active chip to deselect (single-string state — equivalent to the
 * "All" view). Mirrors the experience-level chip-strip pattern. Counts come
 * from the listing API's facets.
 */
export function WorkModeSegment({
  value,
  onChange,
  inlineLabel,
  facets,
  nowrap,
}: WorkModeSegmentProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        nowrap ? "flex-nowrap w-max" : "flex-wrap",
      )}
    >
      {inlineLabel && (
        <span className="text-xs uppercase tracking-wide text-zinc-500 mr-2 shrink-0">
          {inlineLabel}
        </span>
      )}
      {WORK_MODE_OPTIONS.map((mode) => {
        const isActive = value === mode;
        const count = facets?.find((f) => f.value === mode)?.count;
        // Click selected chip again to deselect (single-string state).
        const handleClick = () => onChange(isActive ? undefined : mode);
        return (
          <button
            key={mode}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
              isActive
                ? "bg-indigo-500/10 border border-indigo-500/40 text-white"
                : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
            )}
          >
            {WORK_MODE_LABELS[mode]}
            {typeof count === "number" && (
              <span className="text-zinc-600 ml-1">
                ({count.toLocaleString()})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
