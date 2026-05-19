"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EXPERIENCE_LEVEL_LABELS,
  WORK_MODE_LABELS,
} from "@/lib/validations/jobs";
import type {
  DatePostedOption,
  JobFilters,
} from "@/types";

/**
 * Active-filter strip rendered below the filter card. One chip per active
 * filter (multi-value filters comma-join their values inside a single chip).
 * Per-chip × removes that filter; the strip-level Clear all wipes everything.
 *
 * The strip is hidden entirely when no filters are active — `summarize` returns
 * an empty array in that case and the parent component short-circuits.
 */

const POSTED_LABELS: Record<Exclude<DatePostedOption, "any">, string> = {
  today: "Today",
  "3days": "Past 3 days",
  week: "Past week",
  month: "Past month",
};

export interface ActiveFilterDescriptor {
  key: keyof JobFilters;
  label: string;
  onRemove: () => void;
}

/**
 * Reduce a JobFilters object into a flat list of removable chip descriptors.
 * Each descriptor's onRemove returns the patch to apply via the parent's
 * onChange — kept declarative so the strip component stays pure-ish.
 *
 * Multi-value filters (companies, levels) collapse into a single chip whose
 * label comma-joins the values; clicking × removes all of them at once.
 * Per-value chips would be visual noise at typical selection counts.
 */
export function summarizeActiveFilters(
  filters: JobFilters,
  onChange: (next: Partial<JobFilters>) => void
): ActiveFilterDescriptor[] {
  const out: ActiveFilterDescriptor[] = [];

  if (filters.query) {
    out.push({
      key: "query",
      label: `Search · "${filters.query}"`,
      onRemove: () => onChange({ query: undefined }),
    });
  }

  if (filters.datePosted && filters.datePosted !== "any") {
    const label = POSTED_LABELS[filters.datePosted as keyof typeof POSTED_LABELS];
    if (label) {
      out.push({
        key: "datePosted",
        label: `Posted · ${label}`,
        onRemove: () => onChange({ datePosted: "any" }),
      });
    }
  }

  if (filters.experienceLevels.length > 0) {
    const labels = filters.experienceLevels
      .map((slug) => EXPERIENCE_LEVEL_LABELS[slug as keyof typeof EXPERIENCE_LEVEL_LABELS] ?? slug)
      .join(", ");
    out.push({
      key: "experienceLevels",
      label: `Level · ${labels}`,
      onRemove: () => onChange({ experienceLevels: [] }),
    });
  }

  if (filters.workMode) {
    const label = WORK_MODE_LABELS[filters.workMode as keyof typeof WORK_MODE_LABELS] ?? filters.workMode;
    out.push({
      key: "workMode",
      label: `Mode · ${label}`,
      onRemove: () => onChange({ workMode: undefined }),
    });
  }

  // Location: prefer the structured city/state pair, fall back to legacy text.
  if (filters.locationCity) {
    const display =
      filters.locationCity && filters.locationState
        ? `${filters.locationCity}, ${filters.locationState}`
        : filters.locationCity;
    out.push({
      key: "locationCity",
      label: `Where · ${display}`,
      onRemove: () =>
        onChange({
          locationCity: undefined,
          locationState: undefined,
          location: undefined,
        }),
    });
  } else if (filters.location) {
    out.push({
      key: "location",
      label: `Where · ${filters.location}`,
      onRemove: () => onChange({ location: undefined }),
    });
  }

  if (filters.companies.length > 0) {
    out.push({
      key: "companies",
      label: `Companies · ${filters.companies.join(", ")}`,
      onRemove: () => onChange({ companies: [] }),
    });
  }

  if (filters.department) {
    out.push({
      key: "department",
      label: `Team · ${filters.department}`,
      onRemove: () => onChange({ department: undefined }),
    });
  }

  return out;
}

interface ActiveFilterStripProps {
  filters: JobFilters;
  onChange: (next: Partial<JobFilters>) => void;
  onClearAll: () => void;
  className?: string;
}

const CHIP_BASE =
  "inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-[12px] font-medium " +
  "bg-accent-lavender/10 border border-accent-lavender/25 text-accent-lavender " +
  "transition-colors duration-150";

export function ActiveFilterStrip({
  filters,
  onChange,
  onClearAll,
  className,
}: ActiveFilterStripProps) {
  const descriptors = summarizeActiveFilters(filters, onChange);
  if (descriptors.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap",
        className
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent-lavender">
        {descriptors.length} ACTIVE
      </span>
      {descriptors.map((d) => (
        <span key={d.key} className={CHIP_BASE}>
          <span className="truncate max-w-[260px]">{d.label}</span>
          <button
            type="button"
            onClick={d.onRemove}
            aria-label={`Remove filter: ${d.label}`}
            className="grid place-items-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-lavender/40"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClearAll}
        className="text-[11.5px] font-medium text-text-dim hover:text-text transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}
