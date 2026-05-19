"use client";

/**
 * Top control strip — Phase 3 of the Browse Jobs editorial redesign.
 *
 * One full-width row above the filter card:
 *
 *   [ ViewTabs (All / Saved) ]  ··  [ SORT pill ]  |  {N} of {total} jobs
 *
 * Decisions (locked by handoff §7.1):
 *   - Sort lives HERE, not inside the filter card.
 *   - The orphan dead-space between left and right clusters is intentional —
 *     do not center anything in it.
 *   - Count text is `font-mono text-text-dim`, formatted with thousands
 *     separators. When filtered < total, the slash + total is dimmer still
 *     so the eye lands on the leading number.
 *
 * The sort dropdown is a tiny Radix Popover-driven menu writing to
 * `JobFilters.sort` via the parent's `onChange` patch. Only two options
 * for now (`newest`, `relevance`); a `recently_saved` slot is coupled to
 * the Saved view in `useJobFilters` and is not user-pickable from here.
 */

import { useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { JobViewTabs } from "@/components/jobs/job-view-tabs";
import type { JobFilters, SortOption } from "@/types";

interface TopControlStripProps {
  isAuthenticated: boolean;
  savedCount: number | null;
  currentCount: number;
  total: number;
  filters: JobFilters;
  onChange: (next: Partial<JobFilters>) => void;
  /** Renders the mobile-only Filters trigger (with active-count badge). */
  onOpenMobileFilters?: () => void;
  /** Active-filter count surfaced on the mobile Filters pill. */
  activeFilterCount?: number;
}

interface SortChoice {
  id: Extract<SortOption, "newest" | "relevance">;
  label: string;
}

const SORT_CHOICES: ReadonlyArray<SortChoice> = [
  { id: "newest", label: "Newest" },
  { id: "relevance", label: "Relevance" },
];

const DIVIDER_CLASS = "hidden sm:inline-block w-px h-[18px] bg-white/[0.08]";

const MONO_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim";

const COUNT_CLASS = "font-mono text-[11px] text-text-dim tabular-nums";

export function TopControlStrip({
  isAuthenticated,
  savedCount,
  currentCount,
  total,
  filters,
  onChange,
  onOpenMobileFilters,
  activeFilterCount = 0,
}: TopControlStripProps) {
  const handleViewChange = useCallback(
    (next: "all" | "saved") => {
      onChange({ saved: next === "saved" ? true : undefined });
    },
    [onChange]
  );

  const handleSortChange = useCallback(
    (next: SortChoice["id"]) => {
      onChange({ sort: next });
    },
    [onChange]
  );

  // `recently_saved` is internally coupled to Saved view; here we surface
  // `newest` as the effective display when the user is on Saved + auto sort.
  const effectiveSort: SortChoice["id"] =
    filters.sort === "relevance" ? "relevance" : "newest";
  const sortLabel =
    SORT_CHOICES.find((s) => s.id === effectiveSort)?.label ?? "Newest";

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-3.5">
      {/* LEFT — view tabs */}
      <JobViewTabs
        active={filters.saved ? "saved" : "all"}
        savedCount={savedCount}
        isAuthenticated={isAuthenticated}
        onChange={handleViewChange}
      />

      {/* Mobile-only Filters trigger — sits beside the view tabs so the
          chip-strip stays accessible without committing scroll space. */}
      {onOpenMobileFilters && (
        <button
          type="button"
          onClick={onOpenMobileFilters}
          className={cn(
            "lg:hidden inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full",
            "bg-white/[0.03] border border-white/[0.08] text-text-muted",
            "hover:border-white/[0.16] hover:text-text transition-colors"
          )}
          aria-label={
            activeFilterCount > 0
              ? `Filters · ${activeFilterCount} active`
              : "Filters"
          }
        >
          <span className="text-[13px] font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span
              className={cn(
                "ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full",
                "font-mono text-[10px] text-accent-lavender",
                "bg-[rgba(196,181,253,0.14)] border border-[rgba(196,181,253,0.3)]"
              )}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* SPACER — the orphan dead-space; do NOT fill. */}
      <span className="flex-1" aria-hidden />

      {/* RIGHT — sort + divider + count. Wraps under the view tabs on
          narrow viewports so we never lose the count off-screen. */}
      <div className="flex items-center gap-3 sm:gap-3.5">
        <span className={MONO_LABEL_CLASS}>SORT</span>
        <SortPill value={effectiveSort} onChange={handleSortChange} label={sortLabel} />
        <span className={DIVIDER_CLASS} aria-hidden />
        <CountReadout currentCount={currentCount} total={total} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────

interface SortPillProps {
  value: SortChoice["id"];
  label: string;
  onChange: (next: SortChoice["id"]) => void;
}

function SortPill({ value, label, onChange }: SortPillProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full",
            "bg-white/[0.03] border border-white/[0.08] text-text",
            "hover:border-white/[0.16] transition-colors",
            "font-display font-medium text-[11.5px]",
            "focus-visible:outline-none focus-visible:border-accent-lavender/40",
            "focus-visible:shadow-[0_0_0_4px_rgba(196,181,253,0.06)]"
          )}
          aria-label={`Sort: ${label}`}
        >
          <ArrowUpDown className="w-3 h-3 text-text-dim" aria-hidden />
          <span>{label}</span>
          <ChevronDown className="w-3 h-3 text-text-dim" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[160px] p-1 rounded-[10px]",
            "bg-bg-elev border border-white/[0.1]",
            "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          )}
        >
          {SORT_CHOICES.map((opt) => {
            const active = opt.id === value;
            return (
              <Popover.Close asChild key={opt.id}>
                <button
                  type="button"
                  onClick={() => onChange(opt.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-[7px]",
                    "text-[13px] transition-colors text-left",
                    active
                      ? "bg-[rgba(196,181,253,0.1)] text-accent-lavender"
                      : "text-text hover:bg-white/[0.04]"
                  )}
                >
                  <span>{opt.label}</span>
                  {active && (
                    <Check className="w-3.5 h-3.5" aria-hidden />
                  )}
                </button>
              </Popover.Close>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ──────────────────────────────────────────────────────────────────────

interface CountReadoutProps {
  currentCount: number;
  total: number;
}

function CountReadout({ currentCount, total }: CountReadoutProps) {
  const showOfTotal = currentCount < total && total > 0;
  return (
    <span className={COUNT_CLASS}>
      {currentCount.toLocaleString()}
      {showOfTotal && (
        <span className="text-text-dim/70"> of {total.toLocaleString()}</span>
      )}{" "}
      jobs
    </span>
  );
}
