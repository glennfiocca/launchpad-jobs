"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePostedChips } from "./filters/date-posted-chips";
import { DepartmentCombobox } from "./filters/department-combobox";
import { ExperienceLevelChips } from "./filters/experience-level-chips";
import { ModeChips } from "./filters/mode-chips";
import { CompanyCombobox } from "./filters/company-combobox";
import {
  ActiveFilterStrip,
  summarizeActiveFilters,
} from "./filters/active-filter-strip";
import { isExperienceFilterEnabledClient } from "@/lib/experience-level";
import { isWorkModeFilterEnabledClient } from "@/lib/work-mode";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { CityStateCombobox } from "@/components/ui/city-state-combobox";
import type { DatePostedOption, JobFacets, JobFilters } from "@/types";

/**
 * Browse Jobs filter card — Phase 2 rebuild.
 *
 * Two stacked rows wrapped in a single card surface:
 *   Row 1 (structured inputs): SEARCH | WHERE | COMPANY | TEAM — all 36px tall.
 *   Row 2 (chip groups):       POSTED · LEVEL · MODE, centered with vertical
 *                              dividers between groups.
 *
 * Below the card, an `ActiveFilterStrip` summarizes the current filter state
 * with per-chip remove + a Clear all link (hidden when no filters are set).
 *
 * State ownership lives entirely in the parent — the card is a controlled
 * surface that emits filter patches via `onChange`. Search input is the only
 * locally-buffered field (debounced 400ms via the shared hook) so typing
 * stays smooth without paying a per-keystroke router push.
 *
 * Sticky positioning is intentionally NOT applied here; Phase 3 wraps the
 * card in the sticky shell.
 */

interface JobFiltersProps {
  filters: JobFilters;
  facets?: JobFacets;
  onChange: (next: Partial<JobFilters>) => void;
  /** Called when the user hits "Clear all" in the active-filter strip. */
  onClearAll: () => void;
  className?: string;
}

const DEBOUNCE_MS = 400;

// Free-text search input — matches the design's input styling. 36px tall,
// 10px radius, lavender focus glow, mono placeholder.
const SEARCH_INPUT_CLASS =
  "w-full h-9 pl-9 pr-3 text-[13px] rounded-[10px] bg-bg text-text " +
  "placeholder:text-text-dim transition-colors duration-150 " +
  "focus:outline-none focus:border-accent-lavender/40 " +
  "focus:shadow-[0_0_0_4px_rgba(196,181,253,0.06)]";

const VERTICAL_DIVIDER = "w-px h-[18px] bg-border mx-1";

export function JobFilters({
  filters,
  facets,
  onChange,
  onClearAll,
  className,
}: JobFiltersProps) {
  // Local text state — provides instant UI feedback while debouncing
  // router updates. Re-syncs whenever the URL changes externally
  // (back/forward, programmatic clear) via the derived-state pattern
  // (React docs: "Storing information from previous renders") — cheaper
  // and lint-clean compared to useEffect + setState.
  const [localQuery, setLocalQuery] = useState(filters.query ?? "");
  const [prevExternalQuery, setPrevExternalQuery] = useState(filters.query);
  if (filters.query !== prevExternalQuery) {
    setPrevExternalQuery(filters.query);
    setLocalQuery(filters.query ?? "");
  }

  const debouncedQueryChange = useDebouncedCallback(
    (next: string) => onChange({ query: next || undefined }),
    DEBOUNCE_MS
  );

  const handleSearchInput = useCallback(
    (raw: string) => {
      setLocalQuery(raw);
      debouncedQueryChange(raw);
    },
    [debouncedQueryChange]
  );

  // Derived display value for the city/state combobox trigger
  const locationDisplay =
    filters.locationCity && filters.locationState
      ? `${filters.locationCity}, ${filters.locationState}`
      : filters.locationCity ?? "";

  // Stable callbacks for each filter primitive
  const handleDatePosted = useCallback(
    (value: DatePostedOption) => onChange({ datePosted: value }),
    [onChange]
  );

  const handleLevels = useCallback(
    (next: string[]) => onChange({ experienceLevels: next }),
    [onChange]
  );

  const handleMode = useCallback(
    (value: string | undefined) => onChange({ workMode: value }),
    [onChange]
  );

  const handleDepartment = useCallback(
    (value: string | undefined) => onChange({ department: value }),
    [onChange]
  );

  const handleCompanies = useCallback(
    (next: string[]) => onChange({ companies: next }),
    [onChange]
  );

  // CityStateCombobox callbacks — the existing component owns the
  // Places-backed autocomplete. We restyle the trigger via the size="lg"
  // path-less alternative: passing className that overrides the inner
  // input's chrome. Easier: we leave it as-is and rely on its `size="sm"`
  // input styling, which already lines up with the 36px-ish height once
  // py is adjusted. The wrapping div below sets the field width.
  const handleLocationSelect = useCallback(
    (city: string, state: string) =>
      onChange({ locationCity: city, locationState: state, location: undefined }),
    [onChange]
  );
  const handleLocationFreeText = useCallback(
    (text: string) =>
      onChange({ location: text, locationCity: undefined, locationState: undefined }),
    [onChange]
  );
  const handleLocationClear = useCallback(
    () =>
      onChange({
        locationCity: undefined,
        locationState: undefined,
        location: undefined,
      }),
    [onChange]
  );

  const showExperienceFilter = isExperienceFilterEnabledClient();
  const showWorkModeFilter = isWorkModeFilterEnabledClient();

  const companyFacets = facets?.companies ?? [];
  const departmentFacets = facets?.departments ?? [];

  // Active-filter chips — used to gate the strip rendering and pass the
  // count info to the strip itself. summarizeActiveFilters is the single
  // source of truth for which filters are considered "active" in the UI.
  const hasActive = summarizeActiveFilters(filters, onChange).length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "bg-bg-elev border border-border rounded-[14px] p-3 space-y-2.5"
        )}
      >
        {/* Row 1 — structured inputs (search, where, company, team) */}
        <div className="flex flex-col md:flex-row gap-2">
          {/* Search — fills remaining space */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Job title, keyword, company…"
              value={localQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              className={cn(
                SEARCH_INPUT_CLASS,
                localQuery
                  ? "border border-accent-lavender/25"
                  : "border border-border"
              )}
              aria-label="Search jobs"
            />
          </div>

          {/* WHERE — wraps CityStateCombobox. The component owns its trigger,
              we just constrain its width to match the design's 170px field. */}
          <div className="md:w-[170px] shrink-0">
            <CityStateCombobox
              value={locationDisplay}
              onSelect={handleLocationSelect}
              onFreeText={handleLocationFreeText}
              onClear={handleLocationClear}
              placeholder="Where"
            />
          </div>

          {/* COMPANY — multi-select typeahead */}
          <div className="md:w-[200px] shrink-0">
            <CompanyCombobox
              value={filters.companies}
              options={companyFacets.map((c) => ({ value: c.name, count: c.count }))}
              onChange={handleCompanies}
              className="w-full"
            />
          </div>

          {/* TEAM — single-select dropdown */}
          {departmentFacets.length > 0 && (
            <div className="md:w-[170px] shrink-0">
              <DepartmentCombobox
                value={filters.department}
                onChange={handleDepartment}
                options={departmentFacets}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Row 2 — chip groups */}
        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">
            POSTED
          </span>
          <DatePostedChips
            value={filters.datePosted}
            onChange={handleDatePosted}
          />

          {showExperienceFilter && (
            <>
              <span className={VERTICAL_DIVIDER} aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">
                LEVEL
              </span>
              <ExperienceLevelChips
                value={filters.experienceLevels}
                onChange={handleLevels}
              />
            </>
          )}

          {showWorkModeFilter && (
            <>
              <span className={VERTICAL_DIVIDER} aria-hidden />
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">
                MODE
              </span>
              <ModeChips value={filters.workMode} onChange={handleMode} />
            </>
          )}
        </div>
      </div>

      {/* Active-filter strip — appears below the card when ≥1 filter is set */}
      {hasActive && (
        <ActiveFilterStrip
          filters={filters}
          onChange={onChange}
          onClearAll={onClearAll}
        />
      )}
    </div>
  );
}
