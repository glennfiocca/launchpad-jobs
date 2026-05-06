"use client";

import { cn } from "@/lib/utils";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  EXPERIENCE_LEVEL_LABELS,
} from "@/lib/validations/jobs";
import type { JobFacets } from "@/types";

interface ExperienceLevelChipsProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** When set, renders a small uppercase label before the first chip. */
  inlineLabel?: string;
  facets?: JobFacets["experienceLevels"];
  /** When true, chips do not wrap (caller is expected to provide overflow-x-auto). */
  nowrap?: boolean;
}

export function ExperienceLevelChips({
  value,
  onChange,
  inlineLabel,
  facets,
  nowrap,
}: ExperienceLevelChipsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        nowrap ? "flex-nowrap w-max" : "flex-wrap"
      )}
    >
      {inlineLabel && (
        <span className="text-xs uppercase tracking-wide text-zinc-500 mr-2 shrink-0">
          {inlineLabel}
        </span>
      )}
      {EXPERIENCE_LEVEL_OPTIONS.map((level) => {
        const isActive = value === level;
        const count = facets?.find((f) => f.value === level)?.count;
        // Click selected chip again to deselect (single-string state, not array).
        const handleClick = () => onChange(isActive ? undefined : level);
        return (
          <button
            key={level}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
              isActive
                ? "bg-indigo-500/10 border border-indigo-500/40 text-white"
                : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            )}
          >
            {EXPERIENCE_LEVEL_LABELS[level]}
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
