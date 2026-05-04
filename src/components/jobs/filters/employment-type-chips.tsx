"use client";

import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/lib/validations/jobs";
import type { JobFacets } from "@/types";

interface EmploymentTypeChipsProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** When set, renders a small uppercase label before the first chip. */
  inlineLabel?: string;
  facets?: JobFacets["employmentTypes"];
  /** When true, chips do not wrap (caller is expected to provide overflow-x-auto). */
  nowrap?: boolean;
}

export function EmploymentTypeChips({
  value,
  onChange,
  inlineLabel,
  facets,
  nowrap,
}: EmploymentTypeChipsProps) {
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
      {EMPLOYMENT_TYPE_OPTIONS.map((type) => {
        const isActive = value === type;
        const count = facets?.find((f) => f.value === type)?.count;
        // Click selected chip again to deselect (single-string state, not array).
        const handleClick = () => onChange(isActive ? undefined : type);
        return (
          <button
            key={type}
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
            {EMPLOYMENT_TYPE_LABELS[type]}
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
