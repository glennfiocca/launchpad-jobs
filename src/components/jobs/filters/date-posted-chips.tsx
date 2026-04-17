"use client";

import { cn } from "@/lib/utils";
import type { DatePostedOption } from "@/types";

const CHIPS: Array<{ label: string; value: DatePostedOption }> = [
  { label: "Any time", value: "any" },
  { label: "Today", value: "today" },
  { label: "3 days", value: "3days" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
];

interface DatePostedChipsProps {
  value: DatePostedOption | undefined;
  onChange: (value: DatePostedOption) => void;
}

export function DatePostedChips({ value, onChange }: DatePostedChipsProps) {
  const active = value ?? "any";
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          onClick={() => onChange(chip.value)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-all",
            active === chip.value
              ? "bg-indigo-500/20 border border-indigo-500/40 text-indigo-300"
              : "bg-white/5 border border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
