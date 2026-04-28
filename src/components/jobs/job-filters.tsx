"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, Building2, Filter, X, ArrowUpDown } from "lucide-react";
import { DatePostedChips } from "./filters/date-posted-chips";
import { useJobFilters } from "@/hooks/use-job-filters";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { CityStateCombobox } from "@/components/ui/city-state-combobox";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_LABELS,
} from "@/lib/validations/jobs";
import type { DatePostedOption, JobFacets, SortOption } from "@/types";

interface JobFiltersProps {
  facets?: JobFacets;
}

const DEBOUNCE_MS = 400;

const INPUT_CLASS =
  "w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white " +
  "placeholder:text-zinc-600 transition-all duration-200 focus:outline-none " +
  "focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20";

export function JobFilters({ facets }: JobFiltersProps) {
  const { filters, updateFilters, clearFilters, hasFilters } = useJobFilters();
  const [showMore, setShowMore] = useState(false);

  // Local text state — provides instant UI feedback while debouncing API calls
  const [localQuery, setLocalQuery] = useState(filters.query ?? "");
  const [localCompany, setLocalCompany] = useState(filters.company ?? "");

  // Sync local text state when URL changes externally (back/forward nav, clear)
  useEffect(() => { setLocalQuery(filters.query ?? ""); }, [filters.query]);
  useEffect(() => { setLocalCompany(filters.company ?? ""); }, [filters.company]);

  const debouncedUpdate = useDebouncedCallback(
    (patch: Parameters<typeof updateFilters>[0]) => updateFilters(patch),
    DEBOUNCE_MS
  );

  // Derived display value for the city/state combobox
  const locationDisplay =
    filters.locationCity && filters.locationState
      ? `${filters.locationCity}, ${filters.locationState}`
      : filters.locationCity ?? "";

  const handleDatePosted = useCallback(
    (value: DatePostedOption) => updateFilters({ datePosted: value }),
    [updateFilters]
  );

  const handleRemote = useCallback(
    (checked: boolean) => updateFilters({ remote: checked || undefined }),
    [updateFilters]
  );

  const handleEmploymentType = useCallback(
    (type: string, checked: boolean) =>
      updateFilters({ employmentType: checked ? type : undefined }),
    [updateFilters]
  );

  const handleSort = useCallback(
    (value: SortOption) => updateFilters({ sort: value }),
    [updateFilters]
  );

  const handleDepartment = useCallback(
    (value: string) => updateFilters({ department: value || undefined }),
    [updateFilters]
  );

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl p-4 mb-4 space-y-3">
      {/* Row 1: Search + Sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Job title, keyword, company..."
            value={localQuery}
            onChange={(e) => {
              setLocalQuery(e.target.value);
              debouncedUpdate({ query: e.target.value || undefined });
            }}
            className={INPUT_CLASS}
          />
        </div>
        <div className="relative shrink-0">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
          <select
            value={filters.sort ?? "newest"}
            onChange={(e) => handleSort(e.target.value as SortOption)}
            className="pl-9 pr-3 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
          >
            <option value="newest">Newest</option>
            <option value="relevance">Relevance</option>
          </select>
        </div>
      </div>

      {/* Row 2: Location + Company */}
      <div className="grid grid-cols-2 gap-3">
        <CityStateCombobox
          value={locationDisplay}
          onSelect={(city, state) =>
            updateFilters({ locationCity: city, locationState: state, location: undefined })
          }
          onFreeText={(text) =>
            updateFilters({ location: text, locationCity: undefined, locationState: undefined })
          }
          onClear={() =>
            updateFilters({ locationCity: undefined, locationState: undefined, location: undefined })
          }
          placeholder="City, State"
        />
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Company"
            value={localCompany}
            onChange={(e) => {
              setLocalCompany(e.target.value);
              debouncedUpdate({ company: e.target.value || undefined });
            }}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Row 3: Date posted chips */}
      <div>
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
          Date posted
        </p>
        <DatePostedChips value={filters.datePosted} onChange={handleDatePosted} />
      </div>

      {/* Row 4: Remote toggle + More filters toggle + Clear */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!filters.remote}
            onChange={(e) => handleRemote(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-indigo-500"
          />
          <span className="text-sm text-zinc-400">
            Remote only
            {facets && (
              <span className="text-zinc-600 ml-1">
                ({facets.totalRemote.toLocaleString()})
              </span>
            )}
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            {showMore ? "Less" : "More filters"}
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors underline"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Expandable: Employment type + Department */}
      {showMore && (
        <div className="pt-3 border-t border-white/8 space-y-4">
          {/* Employment type checkboxes */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Employment type
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {EMPLOYMENT_TYPE_OPTIONS.map((type) => {
                const facetEntry = facets?.employmentTypes.find(
                  (e) => e.value === type
                );
                return (
                  <label
                    key={type}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={filters.employmentType === type}
                      onChange={(e) =>
                        handleEmploymentType(type, e.target.checked)
                      }
                      className="w-3.5 h-3.5 rounded accent-indigo-500"
                    />
                    <span className="text-sm text-zinc-400">
                      {EMPLOYMENT_TYPE_LABELS[type]}
                      {facetEntry && (
                        <span className="text-zinc-600 ml-1">
                          ({facetEntry.count.toLocaleString()})
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Department */}
          {facets && facets.departments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Department
              </p>
              <select
                value={filters.department ?? ""}
                onChange={(e) => handleDepartment(e.target.value)}
                className="w-full py-2.5 px-3 text-sm rounded-xl border border-white/10 bg-black text-white focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              >
                <option value="">All departments</option>
                {facets.departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value} ({d.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
