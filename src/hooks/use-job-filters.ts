"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DatePostedOption, JobFilters, SortOption } from "@/types";

// Parse the `companies` (plural, canonical) or legacy `company` (singular)
// query param into a deduped string[]. Empty / whitespace-only entries
// are dropped. Returns [] when neither param is present.
function parseCompaniesParam(params: URLSearchParams): string[] {
  const raw = params.get("companies");
  if (raw) {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return Array.from(new Set(list));
  }
  const legacy = params.get("company");
  if (legacy && legacy.trim()) return [legacy.trim()];
  return [];
}

function parseFilters(params: URLSearchParams): JobFilters {
  const salMinRaw = params.get("salMin");
  const salMaxRaw = params.get("salMax");
  // Legacy `?remote=true` is intentionally NOT mapped to workMode here.
  // It silently filtered users to remote-only on stale bookmarks; the new
  // workMode segment is the only way to opt into a mode filter.
  const workMode = params.get("mode") ?? undefined;
  return {
    query: params.get("q") ?? undefined,
    location: params.get("location") ?? undefined,
    locationCity: params.get("city") ?? undefined,
    locationState: params.get("state") ?? undefined,
    department: params.get("dept") ?? undefined,
    // Multi-select company filter. Supports both:
    //   ?companies=Stripe,OpenAI   (preferred — canonical form)
    //   ?company=Stripe            (legacy single-value — back-compat)
    // Phase 2 will replace the UI input with a multi-select chip group;
    // for now the existing single-input shim writes [name] or [].
    companies: parseCompaniesParam(params),
    employmentType: params.get("type") ?? undefined,
    experienceLevel: params.get("level") ?? undefined,
    workMode,
    datePosted: (params.get("date") as DatePostedOption) ?? undefined,
    salaryMin: salMinRaw ? Number(salMinRaw) : undefined,
    salaryMax: salMaxRaw ? Number(salMaxRaw) : undefined,
    sort: (params.get("sort") as SortOption) ?? undefined,
    saved: params.get("saved") === "1" ? true : undefined,
  };
}

function filtersToParams(filters: JobFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.query) p.set("q", filters.query);
  if (filters.location) p.set("location", filters.location);
  if (filters.locationCity) p.set("city", filters.locationCity);
  if (filters.locationState) p.set("state", filters.locationState);
  if (filters.department) p.set("dept", filters.department);
  // Serialize as `?companies=A,B`. Phase 2 owns the proper multi-select UI;
  // until then the input shim writes 0 or 1 entries.
  if (filters.companies.length > 0) {
    p.set("companies", filters.companies.join(","));
  }
  // `remote` legacy boolean is no longer serialized — workMode covers it.
  // Old `?remote=true` URLs are read on parse and rewritten as `?mode=remote`.
  if (filters.employmentType) p.set("type", filters.employmentType);
  if (filters.experienceLevel) p.set("level", filters.experienceLevel);
  if (filters.workMode) p.set("mode", filters.workMode);
  if (filters.datePosted && filters.datePosted !== "any")
    p.set("date", filters.datePosted);
  if (filters.salaryMin !== undefined) p.set("salMin", String(filters.salaryMin));
  if (filters.salaryMax !== undefined) p.set("salMax", String(filters.salaryMax));
  if (filters.sort && filters.sort !== "newest") p.set("sort", filters.sort);
  if (filters.saved) p.set("saved", "1");
  return p;
}

export function useJobFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFilters(searchParams),
    [searchParams]
  );

  const updateFilters = useCallback(
    (updates: Partial<JobFilters>) => {
      const next: JobFilters = { ...filters, ...updates };

      // Sort default coupling to the Saved view:
      //   - Toggling Saved ON with the default ("newest") sort → switch to
      //     "recently_saved", which is the more useful default for a list of
      //     things YOU saved. The user can still change the dropdown.
      //   - Toggling Saved OFF while sort is "recently_saved" → reset to
      //     "newest", since recently_saved is meaningless outside the saved
      //     view (the API ignores it without saved=1).
      if (updates.saved === true && (filters.sort ?? "newest") === "newest") {
        next.sort = "recently_saved";
      }
      if (updates.saved === undefined && filters.saved && next.sort === "recently_saved") {
        next.sort = "newest";
      }

      const params = filtersToParams(next);
      // Preserve ?job= param when updating filters
      const jobParam = searchParams.get("job");
      if (jobParam) params.set("job", jobParam);
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [filters, pathname, router, searchParams]
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    const jobParam = searchParams.get("job");
    if (jobParam) params.set("job", jobParam);
    // Saved is a view, not a filter — preserve it across "Clear all".
    if (searchParams.get("saved") === "1") {
      params.set("saved", "1");
      params.set("sort", "recently_saved");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // `saved` is intentionally NOT counted as an active filter — it represents
  // a different view, not a refinement, so "Clear all" leaves it intact.
  const hasFilters = !!(
    filters.query ||
    filters.location ||
    filters.locationCity ||
    filters.locationState ||
    filters.department ||
    filters.companies.length > 0 ||
    filters.employmentType ||
    filters.experienceLevel ||
    filters.workMode ||
    (filters.datePosted && filters.datePosted !== "any") ||
    filters.salaryMin !== undefined ||
    filters.salaryMax !== undefined
  );

  return { filters, updateFilters, clearFilters, hasFilters };
}
