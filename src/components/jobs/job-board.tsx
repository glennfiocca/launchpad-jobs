"use client";

/**
 * JobBoard — Phase 3 of the Browse Jobs editorial redesign.
 *
 * The layout shell. This file owns:
 *   - Window-level scroll (no nested overflow containers; the page is a
 *     natural-document block per the dashboard pattern).
 *   - The sticky filter shell — top control strip + filter card pinned
 *     under the navbar at `top: var(--navbar-h)` with backdrop-blur.
 *   - The two-pane grid — `1fr 560px` when a job is selected, `1fr` when
 *     not, with a 250ms cubic-bezier `grid-template-columns` transition.
 *   - The right pane's sticky positioning (desktop only). On mobile, the
 *     detail/apply replaces the list as a full-screen overlay.
 *   - The mobile filter sheet (Radix Dialog bottom-drawer).
 *
 * What this file does NOT own:
 *   - JobCard / JobDetail / ApplyModal internals (Phases 4 + 5).
 *   - Filter primitive styling (Phase 2 — `job-filters.tsx`).
 *   - Top-strip styling (`./cockpit/top-control-strip.tsx`).
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { JobFilters as FiltersBar } from "./job-filters";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { EmptySavedState } from "./empty-saved-state";
import { TopControlStrip } from "./cockpit/top-control-strip";
import { MobileFilterSheet } from "./cockpit/mobile-filter-sheet";
import { summarizeActiveFilters } from "./filters/active-filter-strip";
import { useJobFilters } from "@/hooks/use-job-filters";
import type {
  ApiResponse,
  ApplicationWithJob,
  JobFacets,
  JobWithCompany,
} from "@/types";

const LIMIT = 20;

// Approximate height reservation for the sticky filter bar when computing
// the right-pane sticky offset. The bar's true height varies (active-filter
// strip toggles, chip wrap, etc.). A fixed reservation accepts a few pixels
// of imperfection in exchange for not measuring with ResizeObserver — the
// detail pane stays visibly pinned in all states, which is the goal.
const STICKY_FILTER_RESERVE_PX = 200;
const STICKY_BOTTOM_RESERVE_PX = 220;

function jobMatchesUrlParam(job: JobWithCompany, param: string): boolean {
  if (job.id === param) return true;
  if (!job.publicJobId) return false;
  return job.publicJobId.toLowerCase() === param.toLowerCase();
}

export function JobBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { filters, updateFilters, clearFilters } = useJobFilters();
  const jobIdFromUrl = searchParams.get("job");
  const isAuthenticated = sessionStatus === "authenticated";
  const onSavedView = !!filters.saved;

  const [jobs, setJobs] = useState<JobWithCompany[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<JobWithCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [facets, setFacets] = useState<JobFacets | undefined>();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const jobsRef = useRef<JobWithCompany[]>([]);
  jobsRef.current = jobs;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const hasAnimatedRef = useRef(false);
  // AbortController for the in-flight /api/jobs fetch. When filters change
  // mid-flight we abort the prior request so its `finally` cleanup does not
  // stomp the new fetch's `loading`/`loadingMore` flags.
  const abortRef = useRef<AbortController | null>(null);

  const hasMore = jobs.length < total;
  hasMoreRef.current = hasMore;

  const loadNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMoreRef.current) return;
    isFetchingRef.current = true;
    setPage((p) => p + 1);
  }, []);

  const recheckSentinel = useCallback(() => {
    const observer = observerRef.current;
    const sentinel = sentinelRef.current;
    if (!observer || !sentinel) return;
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }, []);

  const fetchJobs = useCallback(
    async (f: typeof filters, p: number, replace: boolean) => {
      // Cancel any in-flight fetch — its result is now stale. The aborted
      // request's catch handler short-circuits before touching shared state.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Mark fetch in-flight so the IntersectionObserver's `loadNextPage`
      // guard does not race-fire a page-2 append while a replace fetch is
      // still loading.
      isFetchingRef.current = true;

      if (replace) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (f.query) params.set("query", f.query);
      if (f.locationCity) params.set("locationCity", f.locationCity);
      if (f.locationState) params.set("locationState", f.locationState);
      if (!f.locationCity && f.location) params.set("location", f.location);
      if (f.department) params.set("department", f.department);
      // Multi-select company filter — `companies=A,B`.
      if (f.companies.length > 0) params.set("companies", f.companies.join(","));
      if (f.employmentType) params.set("employmentType", f.employmentType);
      // Multi-select experience-level filter — `levels=A,B`.
      if (f.experienceLevels.length > 0) params.set("levels", f.experienceLevels.join(","));
      if (f.workMode) params.set("workMode", f.workMode);
      if (f.datePosted && f.datePosted !== "any")
        params.set("datePosted", f.datePosted);
      if (f.salaryMin !== undefined) params.set("salaryMin", String(f.salaryMin));
      if (f.salaryMax !== undefined) params.set("salaryMax", String(f.salaryMax));
      if (f.sort) params.set("sort", f.sort);
      if (f.saved) params.set("saved", "true");

      try {
        const res = await fetch(`/api/jobs?${params}`, { signal: controller.signal });
        const data: ApiResponse<JobWithCompany[]> = await res.json();
        // Stale-write guard: abort only kills the network leg, not an
        // already-buffered response body. If a newer fetch has taken over
        // (`abortRef` no longer points at us), discard this result.
        if (abortRef.current !== controller) return;
        if (data.success && data.data) {
          const newTotal = data.meta?.total ?? 0;
          if (replace) {
            setJobs(data.data);
            hasAnimatedRef.current = false;
            hasMoreRef.current = data.data.length > 0 && data.data.length < newTotal;
          } else {
            setJobs((prev) => {
              const existingIds = new Set(prev.map((j) => j.id));
              const merged = [...prev, ...data.data!.filter((j) => !existingIds.has(j.id))];
              const grew = merged.length > prev.length;
              hasMoreRef.current = grew && merged.length < newTotal;
              return merged;
            });
          }
          setTotal(newTotal);
          if (data.meta?.facets) setFacets(data.meta.facets);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // non-fatal: leave previous list intact
      } finally {
        if (abortRef.current === controller) {
          isFetchingRef.current = false;
          if (replace) setLoading(false);
          else setLoadingMore(false);
          recheckSentinel();
        }
      }
    },
    [recheckSentinel]
  );

  // Observer set up once. Root is the VIEWPORT (`null`) now that scroll
  // is window-level — the prior `root: listRef.current` no longer applies.
  // Wider `rootMargin` so paging triggers a screen earlier and the user
  // doesn't hit a visible spinner on quick scrolls.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadNextPage();
      },
      { root: null, rootMargin: "0px 0px 600px 0px" }
    );

    observer.observe(sentinel);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadNextPage]);

  // Filter change: reset to page 1 and fetch fresh. Use a key derived from
  // searchParams minus the ?job= param so selecting/deselecting a job does
  // not trigger a spurious page-1 reset.
  const filterKey = new URLSearchParams(
    [...searchParams.entries()].filter(([k]) => k !== "job")
  ).toString();

  useEffect(() => {
    isFetchingRef.current = false;
    setLoadingMore(false);
    setPage(1);
    fetchJobs(filtersRef.current, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Page increment from infinite scroll: append next page
  useEffect(() => {
    if (page === 1) return;
    fetchJobs(filtersRef.current, page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchJobs]);

  // Clear selection when URL has no ?job=
  useEffect(() => {
    if (!jobIdFromUrl) setSelected(null);
  }, [jobIdFromUrl]);

  // Load applied job IDs for current user
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      setAppliedJobIds(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/applications");
        const data: ApiResponse<ApplicationWithJob[]> = await res.json();
        if (!cancelled && data.success && data.data) {
          setAppliedJobIds(new Set(data.data.map((a) => a.jobId)));
        }
      } catch {
        if (!cancelled) setAppliedJobIds(new Set());
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, sessionStatus]);

  // Load saved job IDs for current user
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      setSavedJobIds(new Set());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs/saved/ids");
        const data: ApiResponse<string[]> = await res.json();
        if (!cancelled && data.success && data.data) {
          setSavedJobIds(new Set(data.data));
        }
      } catch {
        if (!cancelled) setSavedJobIds(new Set());
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id, sessionStatus]);

  const handleSaveToggle = useCallback(
    (jobId: string, saved: boolean) => {
      setSavedJobIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(jobId);
        else next.delete(jobId);
        return next;
      });

      // On the Saved view, an un-save makes the row no longer belong here.
      if (!saved && filtersRef.current.saved) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        setTotal((t) => Math.max(0, t - 1));
      }
    },
    []
  );

  // Select job from loaded list when URL param matches
  useEffect(() => {
    if (!jobIdFromUrl) return;
    const match = jobs.find((j) => jobMatchesUrlParam(j, jobIdFromUrl));
    if (match) setSelected(match);
  }, [jobIdFromUrl, jobs]);

  // Fetch individual job by id/publicJobId when not in list
  useEffect(() => {
    if (!jobIdFromUrl || loading) return;
    const inList = jobsRef.current.some((j) => jobMatchesUrlParam(j, jobIdFromUrl));
    if (inList) return;

    const ac = new AbortController();
    const param = jobIdFromUrl;

    (async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(param)}`, {
          signal: ac.signal,
        });
        const data: ApiResponse<JobWithCompany> = await res.json();
        if (ac.signal.aborted) return;
        if (data.success && data.data) {
          setSelected(data.data);
        } else {
          router.replace("/jobs", { scroll: false });
        }
      } catch {
        if (!ac.signal.aborted) router.replace("/jobs", { scroll: false });
      }
    })();

    return () => { ac.abort(); };
  }, [jobIdFromUrl, loading, router]);

  const selectJob = useCallback(
    (job: JobWithCompany) => {
      setSelected(job);
      const slug = job.publicJobId ?? job.id;
      const params = new URLSearchParams(searchParams.toString());
      params.set("job", encodeURIComponent(slug));
      router.replace(`/jobs?${params}`, { scroll: false });
    },
    [router, searchParams]
  );

  const closeDetail = useCallback(() => {
    setSelected(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }, [router, searchParams]);

  const handleApplied = useCallback((jobId: string) => {
    setAppliedJobIds((prev) => new Set([...prev, jobId]));
  }, []);

  // Active-filter count — drives the mobile Filters trigger badge AND the
  // sheet's "Clear all" disabled state. Reuses the canonical source from
  // the active-filter-strip module.
  const activeFilterCount = useMemo(
    () => summarizeActiveFilters(filters, updateFilters).length,
    [filters, updateFilters]
  );

  const showSavedEmptyState =
    !loading && jobs.length === 0 && onSavedView && isAuthenticated;
  const showNoResults =
    !loading && jobs.length === 0 && !showSavedEmptyState;
  const showList = !loading && jobs.length > 0;

  return (
    <>
      {/* ── Sticky filter shell ────────────────────────────────────────
          Pinned under the navbar. Backdrop-blurred so list rows scrolling
          beneath are obscured cleanly. The negative `-mx-7` + `px-7` lets
          the backdrop bleed to the page edges while content stays in the
          1480-wide column. */}
      <div
        className="sticky z-30 -mx-7 px-7 pt-3 pb-3 bg-bg/92 backdrop-blur-xl border-b border-border"
        style={{ top: "var(--navbar-h)" }}
      >
        <TopControlStrip
          isAuthenticated={isAuthenticated}
          savedCount={isAuthenticated ? savedJobIds.size : null}
          currentCount={jobs.length}
          total={total}
          filters={filters}
          onChange={updateFilters}
          onOpenMobileFilters={() => setMobileFiltersOpen(true)}
          activeFilterCount={activeFilterCount}
        />

        {/* Desktop: inline filter card. Mobile: hidden — lives in the sheet. */}
        <div className="mt-3 hidden lg:block">
          <FiltersBar
            filters={filters}
            facets={facets}
            onChange={updateFilters}
            onClearAll={clearFilters}
          />
        </div>
      </div>

      {/* ── Two-pane grid ─────────────────────────────────────────────
          `grid-template-columns` transitions between `1fr` and `1fr 560px`
          when the detail pane opens / closes. Right pane is hidden on
          mobile; a full-screen overlay handles that case below. */}
      <div
        className="mt-4 grid gap-[18px] items-start transition-[grid-template-columns] duration-[250ms]"
        style={{
          gridTemplateColumns: selected ? "1fr 560px" : "1fr",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* LEFT — list */}
        <div className="min-w-0">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          )}

          {showSavedEmptyState && (
            <EmptySavedState
              onBrowseAll={() => updateFilters({ saved: undefined })}
            />
          )}

          {showNoResults && (
            <div className="text-center py-24">
              <p className="text-text-muted text-lg">No jobs found</p>
              <p className="text-text-dim text-sm mt-1">
                Try adjusting your filters
              </p>
            </div>
          )}

          {showList && (
            <div className="space-y-2">
              {jobs.map((job, index) => {
                const shouldAnimate =
                  !hasAnimatedRef.current && index < 10;
                if (
                  index === jobs.length - 1 &&
                  !hasAnimatedRef.current
                ) {
                  hasAnimatedRef.current = true;
                }
                return (
                  <motion.div
                    key={job.id}
                    initial={shouldAnimate ? { opacity: 0, y: 12 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      ease: "easeOut",
                      delay: shouldAnimate
                        ? Math.min(index * 0.04, 0.4)
                        : 0,
                    }}
                  >
                    <JobCard
                      job={job}
                      selected={selected?.id === job.id}
                      onClick={() => selectJob(job)}
                      isSaved={savedJobIds.has(job.id)}
                      onSaveToggle={handleSaveToggle}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Sentinel + bottom states */}
          <div ref={sentinelRef} className="py-6 flex justify-center">
            {!loading && loadingMore && (
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            )}
            {!loading && !loadingMore && !hasMore && jobs.length > 0 && (
              <p className="text-xs text-text-dim">
                All {total.toLocaleString()} jobs loaded
              </p>
            )}
          </div>
        </div>

        {/* RIGHT — detail pane (desktop only). Sticky-pinned beneath the
            filter shell using a generous fixed offset; see comment on
            STICKY_FILTER_RESERVE_PX above for rationale. */}
        {selected && (
          <aside
            className="hidden lg:block w-[560px] sticky"
            style={{
              top: `calc(var(--navbar-h) + ${STICKY_FILTER_RESERVE_PX}px)`,
              maxHeight: `calc(100vh - var(--navbar-h) - ${STICKY_BOTTOM_RESERVE_PX}px)`,
              minHeight: 480,
            }}
          >
            <JobDetail
              job={selected}
              hasPriorApplication={appliedJobIds.has(selected.id)}
              onClose={closeDetail}
              isSaved={savedJobIds.has(selected.id)}
              onSaveToggle={handleSaveToggle}
              onApplied={handleApplied}
            />
          </aside>
        )}
      </div>

      {/* ── Mobile detail/apply — full-screen replace ─────────────────
          On `< lg`, the right pane doesn't render in-grid. Instead the
          selected job's detail covers the viewport. Phase 5 will swap
          the inner JobDetail's apply modal for the inline apply pane;
          this overlay is the dock the pane will live in. */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-40 bg-bg overflow-y-auto">
          <JobDetail
            job={selected}
            hasPriorApplication={appliedJobIds.has(selected.id)}
            onClose={closeDetail}
            isSaved={savedJobIds.has(selected.id)}
            onSaveToggle={handleSaveToggle}
            onApplied={handleApplied}
          />
        </div>
      )}

      {/* ── Mobile filter sheet ───────────────────────────────────────
          Bottom drawer wrapping the same FiltersBar. Trigger lives in
          TopControlStrip (passes onOpenMobileFilters). */}
      <MobileFilterSheet
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        filters={filters}
        facets={facets}
        onChange={updateFilters}
        onClearAll={clearFilters}
        activeFilterCount={activeFilterCount}
      />
    </>
  );
}
