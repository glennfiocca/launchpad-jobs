"use client";

/**
 * Mobile filter bottom-sheet — Phase 3 of the Browse Jobs editorial redesign.
 *
 * On `< lg` viewports the inline filter card disappears; this Radix Dialog
 * slides up from the bottom and wraps the same <JobFilters /> instance.
 *
 * Decisions:
 *   - Built on Radix Dialog (same dep the dashboard's EmailThreadModal uses).
 *   - Slides up from the bottom — translateY animation, NOT centered fade.
 *   - Header: title + Done button. Footer: Clear all + Apply. Body: <JobFilters>.
 *   - Filter mutations propagate immediately (no commit on Apply); Apply
 *     just closes the sheet. This matches desktop behavior where every chip
 *     toggle hits the URL on click. "Apply" is purely a dismiss affordance.
 *   - "Clear all" calls the parent's onClearAll, then closes the sheet.
 *   - The Dialog is `<Dialog.Root open={open}>` so the trigger lives in
 *     TopControlStrip (one source of truth for the active-filter count badge).
 */

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { JobFilters as FiltersBar } from "@/components/jobs/job-filters";
import type { JobFacets, JobFilters } from "@/types";

interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: JobFilters;
  facets?: JobFacets;
  onChange: (next: Partial<JobFilters>) => void;
  onClearAll: () => void;
  /** Count of active filters — drives "Clear all" enabled state. */
  activeFilterCount: number;
}

export function MobileFilterSheet({
  open,
  onOpenChange,
  filters,
  facets,
  onChange,
  onClearAll,
  activeFilterCount,
}: MobileFilterSheetProps) {
  function handleClearAll(): void {
    onClearAll();
    // Leave the sheet open so the user can keep tweaking; the inline strip
    // collapses to its empty state inside the body and the badge zeroes out.
  }

  function handleApply(): void {
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <Dialog.Content
          className={cn(
            "lg:hidden fixed inset-x-0 bottom-0 z-50",
            "max-h-[88vh] flex flex-col",
            "bg-bg-elev border-t border-border",
            "rounded-t-[16px] overflow-hidden",
            "shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.85)]",
            "focus:outline-none",
            // Slide-up animation
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom",
            "data-[state=open]:duration-200 data-[state=closed]:duration-150"
          )}
          aria-describedby={undefined}
        >
          {/* Drag handle (visual only) */}
          <div className="pt-2 pb-1 flex justify-center" aria-hidden>
            <span className="block w-9 h-1 rounded-full bg-white/[0.16]" />
          </div>

          {/* Header */}
          <div className="px-5 pt-1 pb-3 flex items-center justify-between border-b border-border">
            <Dialog.Title className="text-text font-display font-semibold text-[15px]">
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 font-mono text-[11px] text-accent-lavender">
                  {activeFilterCount} active
                </span>
              )}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close filters"
                className="text-text-dim hover:text-text transition-colors p-1 rounded-md -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — same FiltersBar component as desktop. Filter mutations
              flow up immediately via onChange; the URL stays in sync. */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <FiltersBar
              filters={filters}
              facets={facets}
              onChange={onChange}
              onClearAll={onClearAll}
            />
          </div>

          {/* Footer — Clear all + Apply */}
          <div className="px-5 py-3 border-t border-border bg-bg-elev flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={activeFilterCount === 0}
              className={cn(
                "h-10 px-4 rounded-[10px] text-[13px] font-medium transition-colors",
                "border border-white/[0.08]",
                activeFilterCount === 0
                  ? "text-text-dim cursor-not-allowed opacity-50"
                  : "text-text-muted hover:text-text hover:border-white/[0.16]"
              )}
            >
              Clear all
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={handleApply}
              className={cn(
                "h-10 px-5 rounded-[10px] text-[13px] font-display font-semibold",
                "bg-text text-bg transition-transform active:scale-[0.985]"
              )}
            >
              Apply
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
