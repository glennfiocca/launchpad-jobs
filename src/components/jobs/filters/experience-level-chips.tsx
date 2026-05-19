"use client";

import { cn } from "@/lib/utils";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  EXPERIENCE_LEVEL_LABELS,
} from "@/lib/validations/jobs";

/**
 * Experience-level chip group.
 *
 * Phase 2: multi-select. Each chip toggles independently. Empty array = no
 * filter (renderer treats this as "any level"). Click an active chip to
 * remove that level from the selection.
 *
 * Counts intentionally omitted from the chip label — the new design's chip
 * row is dense and tight; facet counts surfaced inside the chips made the
 * row read as data-heavy. Counts still appear in the dropdown filters
 * (CompanyCombobox, etc.) where there's more room.
 */

interface ExperienceLevelChipsProps {
  value: string[];
  onChange: (next: string[]) => void;
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

export function ExperienceLevelChips({
  value,
  onChange,
  nowrap,
}: ExperienceLevelChipsProps) {
  const selected = new Set(value);

  const toggle = (level: string) => {
    const next = selected.has(level)
      ? value.filter((v) => v !== level)
      : [...value, level];
    onChange(next);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        nowrap ? "flex-nowrap w-max" : "flex-wrap"
      )}
    >
      {EXPERIENCE_LEVEL_OPTIONS.map((level) => {
        const isActive = selected.has(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => toggle(level)}
            aria-pressed={isActive}
            className={cn(CHIP_BASE, isActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {EXPERIENCE_LEVEL_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}
