"use client";

import { cn } from "@/lib/utils";
import { WORK_MODE_OPTIONS, WORK_MODE_LABELS } from "@/lib/validations/jobs";

/**
 * Work-mode chip group. Single-select with toggle-off semantics — only one
 * mode at a time makes sense (a job can't be both remote AND onsite). Click
 * the active chip to clear the filter.
 *
 * Renamed from `work-mode-segment.tsx` in Phase 2 — the segmented-control
 * pattern is gone, replaced with three free-standing chips that read as
 * part of the same canonical row alongside POSTED and LEVEL.
 */

interface ModeChipsProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** When true, chips do not wrap (caller is expected to provide overflow-x-auto). */
  nowrap?: boolean;
}

const CHIP_BASE =
  "shrink-0 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-lavender/40";

const CHIP_INACTIVE =
  "bg-white/[0.03] border border-border text-text-muted hover:border-border-strong hover:text-text";

const CHIP_ACTIVE =
  "bg-accent-lavender/10 border border-accent-lavender/25 text-accent-lavender";

export function ModeChips({ value, onChange, nowrap }: ModeChipsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        nowrap ? "flex-nowrap w-max" : "flex-wrap"
      )}
    >
      {WORK_MODE_OPTIONS.map((mode) => {
        const isActive = value === mode;
        const handleClick = () => onChange(isActive ? undefined : mode);
        return (
          <button
            key={mode}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            className={cn(CHIP_BASE, isActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {WORK_MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
