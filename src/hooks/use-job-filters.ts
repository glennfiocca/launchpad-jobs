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
    department: params.get("dept") ?? undefined,
    company: params.get("company") ?? undefined,
    remote: params.get("remote") === "true" ? true : undefined,
    employmentType: params.get("type") ?? undefined,
    datePosted: (params.get("date") as DatePostedOption) ?? undefined,
    salaryMin: salMinRaw ? Number(salMinRaw) : undefined,
    salaryMax: salMaxRaw ? Number(salMaxRaw) : undefined,
    sort: (params.get("sort") as SortOption) ?? undefined,
  };
}

function filtersToParams(filters: JobFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.query) p.set("q", filters.query);
  if (filters.location) p.set("location", filters.location);
  if (filters.department) p.set("dept", filters.department);
  if (filters.company) p.set("company", filters.company);
  if (filters.remote) p.set("remote", "true");
  if (filters.employmentType) p.set("type", filters.employmentType);
  if (filters.datePosted && filters.datePosted !== "any")
    p.set("date", filters.datePosted);
  if (filters.salaryMin !== undefined) p.set("salMin", String(filters.salaryMin));
  if (filters.salaryMax !== undefined) p.set("salMax", String(filters.salaryMax));
  if (filters.sort && filters.sort !== "newest") p.set("sort", filters.sort);
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
      const next = { ...filters, ...updates };
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
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const hasFilters = !!(
    filters.query ||
    filters.location ||
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
