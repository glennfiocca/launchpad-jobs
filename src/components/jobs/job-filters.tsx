"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, Building2, X, ArrowUpDown } from "lucide-react";
import { DatePostedChips } from "./filters/date-posted-chips";
import { DepartmentCombobox } from "./filters/department-combobox";
import { ExperienceLevelChips } from "./filters/experience-level-chips";
import { isExperienceFilterEnabledClient } from "@/lib/experience-level";
import { useJobFilters } from "@/hooks/use-job-filters";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { CityStateCombobox } from "@/components/ui/city-state-combobox";
import type { DatePostedOption, JobFacets, SortOption } from "@/types";

interface JobFiltersProps {
  facets?: JobFacets;
}

const DEBOUNCE_MS = 400;

const INPUT_CLASS =
  "w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white " +
  "placeholder:text-zinc-600 transition-all duration-200 focus:outline-none " +
  "focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20";

const SORT_CLASS =
  "w-[150px] pl-9 pr-3 py-2 text-sm rounded-xl border border-white/10 bg-black text-white " +
  "focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 " +
  "appearance-none cursor-pointer";

const VERTICAL_DIVIDER = "w-px h-5 bg-white/10";

interface RemoteToggleProps {
  active: boolean;
  onToggle: () => void;
  count?: number;
}

function RemoteToggle({ active, onToggle, count }: RemoteToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={
        "inline-flex items-center gap-2 px-3 h-8 rounded-full border text-sm transition-colors " +
        "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 " +
        (active
          ? "border-indigo-500/40 bg-indigo-500/10 text-white"
          : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200")
      }
    >
      <span
        className={
          "w-1.5 h-1.5 rounded-full " +
          (active ? "bg-indigo-500" : "bg-zinc-600")
        }
        aria-hidden
      />
      Remote only
      {typeof count === "number" && (
        <span className="text-zinc-500">({count.toLocaleString()})</span>
      )}
    </button>
  );
}

interface SortSelectProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className="relative">
      <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className={SORT_CLASS}
        aria-label="Sort jobs"
      >
        <option value="newest">Newest</option>
        <option value="relevance">Relevance</option>
      </select>
    </div>
  );
}

interface ClearAllButtonProps {
  onClick: () => void;
}

function ClearAllButton({ onClick }: ClearAllButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors underline focus:outline-none focus:ring-2 focus:ring-indigo-500/40 rounded"
    >
      <X className="w-3 h-3" />
      Clear all
    </button>
  );
}

export function JobFilters({ facets }: JobFiltersProps) {
  const { filters, updateFilters, clearFilters, hasFilters } = useJobFilters();

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

  const handleSort = useCallback(
    (value: SortOption) => updateFilters({ sort: value }),
    [updateFilters]
  );

  const handleDepartment = useCallback(
    (value: string | undefined) => updateFilters({ department: value }),
    [updateFilters]
  );

  const handleExperienceLevel = useCallback(
    (value: string | undefined) => updateFilters({ experienceLevel: value }),
    [updateFilters]
  );

  const remoteActive = !!filters.remote;
  const departments = facets?.departments ?? [];
  const experienceLevels = facets?.experienceLevels ?? [];
  const sortValue = filters.sort ?? "newest";
  const showExperienceFilter = isExperienceFilterEnabledClient();

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl p-4 mb-4 space-y-3">
      {/* Row 1 — primary inputs: Search / Location / Company */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="relative md:col-span-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Job title, keyword, company..."
            value={localQuery}
            onChange={(e) => {
              setLocalQuery(e.target.value);
              debouncedUpdate({ query: e.target.value || undefined });
            }}
            className={INPUT_CLASS}
            aria-label="Search jobs"
          />
        </div>
        {/* Mobile: location + company side-by-side; desktop: each spans 3/12 */}
        <div className="grid grid-cols-2 gap-3 md:contents">
          <div className="md:col-span-3">
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
          </div>
          <div className="relative md:col-span-3">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
            <input
              type="text"
              placeholder="Company"
              value={localCompany}
              onChange={(e) => {
                setLocalCompany(e.target.value);
                debouncedUpdate({ company: e.target.value || undefined });
              }}
              className={INPUT_CLASS}
              aria-label="Filter by company"
            />
          </div>
        </div>
      </div>

      {/* Row 2 — desktop: posted chips + department on the left, controls on the right */}
      <div className="hidden md:flex items-center gap-3 flex-wrap">
        <DatePostedChips
          value={filters.datePosted}
          onChange={handleDatePosted}
          inlineLabel="Posted:"
        />

        {departments.length > 0 && (
          <>
            <span className={VERTICAL_DIVIDER} aria-hidden />
            <DepartmentCombobox
              value={filters.department}
              onChange={handleDepartment}
              options={departments}
              className="w-[260px]"
            />
          </>
        )}

        {showExperienceFilter && (
          <>
            <span className={VERTICAL_DIVIDER} aria-hidden />
            <ExperienceLevelChips
              value={filters.experienceLevel}
              onChange={handleExperienceLevel}
              inlineLabel="Level:"
              facets={experienceLevels}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <RemoteToggle
            active={remoteActive}
            onToggle={() => handleRemote(!remoteActive)}
            count={facets?.totalRemote}
          />
          <SortSelect value={sortValue} onChange={handleSort} />
          {hasFilters && <ClearAllButton onClick={clearFilters} />}
        </div>
      </div>

      {/* Row 2 — mobile: department, posted chips scroll horizontally, controls below */}
      <div className="md:hidden space-y-3">
        {departments.length > 0 && (
          <DepartmentCombobox
            value={filters.department}
            onChange={handleDepartment}
            options={departments}
            className="w-full"
          />
        )}
        <div className="-mx-1 px-1 overflow-x-auto">
          <DatePostedChips
            value={filters.datePosted}
            onChange={handleDatePosted}
            inlineLabel="Posted:"
            nowrap
          />
        </div>
        {showExperienceFilter && (
          <div className="-mx-1 px-1 overflow-x-auto">
            <ExperienceLevelChips
              value={filters.experienceLevel}
              onChange={handleExperienceLevel}
              inlineLabel="Level:"
              facets={experienceLevels}
              nowrap
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <RemoteToggle
            active={remoteActive}
            onToggle={() => handleRemote(!remoteActive)}
            count={facets?.totalRemote}
          />
          <SortSelect value={sortValue} onChange={handleSort} />
        </div>
        {hasFilters && (
          <div className="flex justify-end">
            <ClearAllButton onClick={clearFilters} />
          </div>
        )}
      </div>
    </div>
  );
}
