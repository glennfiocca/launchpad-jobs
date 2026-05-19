"use client";

import { cn } from "@/lib/utils";
import type { DatePostedOption } from "@/types";

/**
 * Date-posted chip group. Single-select with toggle-off semantics — clicking
 * the active chip clears the filter (returning to "any time"). The "Any time"
 * chip from the old design is intentionally dropped: the empty state already
 * means "any time", and the design's canonical chip count for this group is 4.
 */

interface ChipSpec {
  label: string;
  value: Exclude<DatePostedOption, "any">;
}

const CHIPS: ChipSpec[] = [
  { label: "Today", value: "today" },
  { label: "3 days", value: "3days" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

interface DatePostedChipsProps {
  value: DatePostedOption | undefined;
  onChange: (value: DatePostedOption) => void;
  /** When true, chips do not wrap (caller is expected to provide overflow-x-auto). */
  nowrap?: boolean;
}

// Canonical chip styling — see §8.1 of the Browse Jobs redesign handoff.
// 28px tall, pill radius, 12px body type, lavender-on-select.
const CHIP_BASE =
  "shrink-0 h-7 px-2.5 rounded-full text-[12px] font-medium transition-colors duration-150 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-lavender/40";

const CHIP_INACTIVE =
  "bg-white/[0.03] border border-border text-text-muted hover:border-border-strong hover:text-text";

const CHIP_ACTIVE =
  "bg-accent-lavender/10 border border-accent-lavender/25 text-accent-lavender";

export function DatePostedChips({
  value,
  onChange,
  nowrap,
}: DatePostedChipsProps) {
  const active = value && value !== "any" ? value : null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        nowrap ? "flex-nowrap w-max" : "flex-wrap"
      )}
    >
      {CHIPS.map((chip) => {
        const isActive = active === chip.value;
        // Single-select with toggle-off — clicking the active chip clears.
        const handleClick = () => onChange(isActive ? "any" : chip.value);
        return (
          <button
            key={chip.value}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            className={cn(CHIP_BASE, isActive ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
