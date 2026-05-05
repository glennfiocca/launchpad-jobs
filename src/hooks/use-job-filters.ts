"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { DatePostedOption, JobFilters, SortOption } from "@/types";

function parseFilters(params: URLSearchParams): JobFilters {
  const salMinRaw = params.get("salMin");
  const salMaxRaw = params.get("salMax");
  return {
    query: params.get("q") ?? undefined,
    location: params.get("location") ?? undefined,
    locationCity: params.get("city") ?? undefined,
    locationState: params.get("state") ?? undefined,
    department: params.get("dept") ?? undefined,
    company: params.get("company") ?? undefined,
    remote: params.get("remote") === "true" ? true : undefined,
    employmentType: params.get("type") ?? undefined,
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
  if (filters.company) p.set("company", filters.company);
  if (filters.remote) p.set("remote", "true");
  if (filters.employmentType) p.set("type", filters.employmentType);
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
    filters.company ||
    filters.remote ||
    filters.employmentType ||
    (filters.datePosted && filters.datePosted !== "any") ||
    filters.salaryMin !== undefined ||
    filters.salaryMax !== undefined
  );

  return { filters, updateFilters, clearFilters, hasFilters };
}
