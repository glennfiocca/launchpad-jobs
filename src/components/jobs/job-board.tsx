"use client";

/**
 * JobBoard — Browse Jobs editorial layout shell (container-scroll model).
 *
 * Scroll model:
 *   - Desktop (`lg+`): the page wrapper is a fixed-height container
 *     (`100dvh - var(--navbar-h)`). JobBoard splits that container into
 *     a sticky-style filter shell (`shrink-0`) and a `flex-1 min-h-0`
 *     two-pane row. EACH PANE OWNS ITS OWN SCROLLBAR — the left list
 *     and right detail scroll independently. The window does NOT scroll.
 *   - Mobile (`<lg`): natural-document window-scroll. The filter shell
 *     stays sticky under the navbar; the detail/apply right pane opens
 *     as a full-screen overlay instead of rendering in-grid.
 *
 * Why container-scroll on desktop:
 *   - Reading a long job description without losing the list. Linear /
 *     Gmail / nearly every two-pane app does this.
 *   - The prior model used `<aside maxHeight=...>` + a child `h-full`
 *     flex chain. `h-full` only resolves against a parent with a
 *     definite height — `maxHeight` is a constraint, not a definite
 *     value — so the inner `flex-1 overflow-y-auto` collapsed and the
 *     description scrolled the window, escaping the visible box.
 *
 * Layout chain (memorize, this is load-bearing):
 *   <Page lg:h-[calc(100dvh-var(--navbar-h))] lg:flex lg:flex-col>
 *     <JobBoard.lg:h-full.lg:flex.lg:flex-col>
 *       <FilterShell shrink-0 sticky-on-mobile>
 *       <DesktopRow hidden lg:flex flex-1 min-h-0>
 *         <Left flex-1 min-w-0 overflow-y-auto>      list scrolls here
 *         <RightAside w-[560px] shrink-0 overflow-y-auto>  detail scrolls here
 *       <MobileList lg:hidden>                       window-scroll on mobile
 *
 * IntersectionObserver root rebinds on breakpoint flip:
 *   - lg+: `root = listEl` (container-scroll → sentinel relative to list)
 *   - <lg: `root = null` (window-scroll → sentinel relative to viewport)
 *
 * What this file does NOT own:
 *   - JobCard / JobDetail / ApplyPane / AppliedCelebration internals.
 *   - Filter primitive styling (`./job-filters.tsx`).
 *   - Top-strip styling (`./cockpit/top-control-strip.tsx`).
 */

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
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
import { ApplyPane } from "./cockpit/apply-pane";
import { AppliedCelebration } from "./cockpit/applied-celebration";
import { useApplyQuestions } from "./cockpit/use-apply-questions";
import { summarizeActiveFilters } from "./filters/active-filter-strip";
import { useJobFilters } from "@/hooks/use-job-filters";
import type {
  ApiResponse,
  ApplicationWithJob,
  CreditStatus,
  JobFacets,
  JobWithCompany,
} from "@/types";
import type { UserProfile } from "@prisma/client";

const LIMIT = 20;

// Tailwind `lg` — must match the breakpoint used in className strings.
// Centralised so the JS media-query and the CSS classes can't drift apart.
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

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

  // Phase 5 — apply flow state lifted from JobDetail. Three exclusive
  // right-pane states drive the ternary below:
  //   1. celebratingApplicationId set  → <AppliedCelebration>
  //   2. applyingJobId === selected.id → <ApplyPane>
  //   3. otherwise                     → <JobDetail>
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [celebratingApplicationId, setCelebratingApplicationId] = useState<
    string | null
  >(null);

  // Profile fetched once per session and reused across every apply
  // open (replaces the legacy modal's per-mount fetch). Lives at the
  // board level so even the question-fetch hook can read it cheaply.
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | undefined>(
    undefined,
  );

  const sentinelRef = useRef<HTMLDivElement>(null);
  // Desktop list scroll container — the IntersectionObserver root at lg+.
  // On mobile (`<lg`) this element doesn't exist; the observer uses
  // `root: null` (viewport) instead. The ref + media-query effect below
  // keep the two in sync across breakpoint flips.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const jobsRef = useRef<JobWithCompany[]>([]);
  jobsRef.current = jobs;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const hasAnimatedRef = useRef(false);

  // Tracks whether we're at the `lg` breakpoint. Drives:
  //   - Which DOM tree renders (desktop two-pane row vs mobile list).
  //   - The IntersectionObserver root (list container vs viewport).
  // Initialised SSR-safely to `false`; the first client effect snaps it
  // to the real value before paint.
  const [isDesktop, setIsDesktop] = useState(false);
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

  // Track the lg breakpoint client-side so the observer's `root` and the
  // rendered DOM tree match. We listen for changes (resize/devtools) and
  // re-run effects that depend on `isDesktop`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // IntersectionObserver — root depends on the scroll model:
  //   - Desktop (container-scroll): root = list scroll container.
  //   - Mobile (window-scroll):     root = null (viewport).
  // Recreated when `isDesktop` flips so the observer always references
  // the live scroll container. Wide `rootMargin` so paging triggers a
  // screen ahead of time (no visible spinner on quick scrolls).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = isDesktop ? listScrollRef.current : null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadNextPage();
      },
      { root, rootMargin: "0px 0px 600px 0px" }
    );

    observer.observe(sentinel);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadNextPage, isDesktop]);

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

  // Profile load — single fetch per session. We don't re-fetch on
  // every apply open; if the user updates their profile in another
  // tab, this stale copy is acceptable (the server still validates).
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const data = (await res.json()) as ApiResponse<UserProfile | null>;
        if (!cancelled && data.success && data.data) setProfile(data.data);
      } catch {
        // non-fatal: ApplyPane handles the null-profile case by showing
        // a guarded error inside the pane.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, sessionStatus]);

  // Credits-remaining for the apply pane footer. Cheap GET, refreshed
  // on each successful application so the count stays current.
  const refreshCredits = useCallback(() => {
    if (sessionStatus !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/billing/status");
        const data = (await res.json()) as ApiResponse<CreditStatus>;
        if (data.success && data.data) {
          setCreditsRemaining(data.data.creditsRemaining);
        }
      } catch {
        // non-fatal: footer hides the count if undefined.
      }
    })();
  }, [sessionStatus]);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  // Silent close: switching jobs mid-apply clears the apply/celebration
  // overlays so the new selection's detail pane renders cleanly. No
  // "unsaved answers?" prompt per the locked spec.
  useEffect(() => {
    setApplyingJobId(null);
    setCelebratingApplicationId(null);
  }, [selected?.id]);

  // Drive the question-fetch hook from the apply state. Returns idle
  // (and skips the network call) whenever the apply pane is closed.
  const applyingJob = useMemo(
    () =>
      applyingJobId && selected?.id === applyingJobId ? selected : null,
    [applyingJobId, selected],
  );
  const questionsState = useApplyQuestions(applyingJob?.id ?? null, profile);

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

  const handleApplied = useCallback(
    (jobId: string, applicationId: string) => {
      setAppliedJobIds((prev) => new Set([...prev, jobId]));
      setApplyingJobId(null);
      setCelebratingApplicationId(applicationId);
      refreshCredits();
    },
    [refreshCredits],
  );

  const handleContinueBrowsing = useCallback(() => {
    setCelebratingApplicationId(null);
    setApplyingJobId(null);
    // `selected` stays set — the user returns to the applied detail.
  }, []);

  /**
   * Renders the right-pane content. Extracted so the desktop sticky
   * `<aside>` and the mobile full-screen overlay can share the same
   * three-way ternary without code duplication.
   */
  const renderRightPane = useCallback(
    (job: JobWithCompany) => {
      if (celebratingApplicationId) {
        return (
          <AppliedCelebration
            job={job}
            applicationId={celebratingApplicationId}
            onContinue={handleContinueBrowsing}
          />
        );
      }
      if (applyingJobId === job.id) {
        // Show a holding spinner while questions are being fetched —
        // we need the matcher result before we can render the form.
        if (!profile || questionsState.phase !== "ready") {
          return (
            <div className="bg-bg-elev border border-white/[0.06] rounded-[14px] h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-accent-lavender animate-spin" />
            </div>
          );
        }
        if (questionsState.error) {
          return (
            <div className="bg-bg-elev border border-white/[0.06] rounded-[14px] h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-400">{questionsState.error}</p>
              <button
                type="button"
                onClick={() => setApplyingJobId(null)}
                className="text-xs text-text-muted hover:text-text underline-offset-2 hover:underline"
              >
                Close
              </button>
            </div>
          );
        }
        return (
          <ApplyPane
            job={job}
            profile={profile}
            totalQuestions={questionsState.questions.length}
            unanswered={questionsState.unanswered}
            creditsRemaining={creditsRemaining}
            onClose={() => setApplyingJobId(null)}
            onApplied={(appId) => handleApplied(job.id, appId)}
          />
        );
      }
      return (
        <JobDetail
          job={job}
          hasPriorApplication={appliedJobIds.has(job.id)}
          onClose={closeDetail}
          isSaved={savedJobIds.has(job.id)}
          onSaveToggle={handleSaveToggle}
          onRequestApply={() => setApplyingJobId(job.id)}
        />
      );
    },
    [
      celebratingApplicationId,
      applyingJobId,
      profile,
      questionsState,
      creditsRemaining,
      appliedJobIds,
      savedJobIds,
      handleApplied,
      handleContinueBrowsing,
      closeDetail,
      handleSaveToggle,
    ],
  );

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

  // List body shared between desktop scroll container and mobile natural
  // flow. Rendered as a function so both call-sites get fresh subtrees —
  // CRUCIAL: the IntersectionObserver sentinel lives inside this body, and
  // React would assign a single ref to whichever rendered last if the JSX
  // were memoised + shared. By rendering twice (once per breakpoint slot)
  // each tree gets its own sentinel DOM node; only the visible one's
  // bounding rect is non-zero, so the observer fires correctly.
  //
  // We gate on `isDesktop` to render ONLY ONE list tree at a time — that
  // way the single `sentinelRef` is always bound to the active DOM node.
  const renderListBody = (): ReactNode => (
    <>
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
    </>
  );

  return (
    // Container-scroll wrapper. At lg+ this fills the parent's fixed
    // height (`100dvh - var(--navbar-h)`) and arranges the filter shell
    // + two-pane row as a flex column. Below lg it's a normal block
    // (natural-document flow) so the page reflows as one document.
    <div className="lg:h-full lg:flex lg:flex-col lg:min-h-0">
      {/* ── Filter shell ──────────────────────────────────────────────
          On mobile: sticky under the navbar (window-scroll model).
          On desktop: `shrink-0` flex child at the top of the container
          scroll wrapper — the sticky positioning is harmless there
          (already at the top of its parent). Backdrop-blur is preserved
          so list rows obscure cleanly when they scroll under it. */}
      <div
        className="sticky lg:static lg:shrink-0 z-30 -mx-7 px-7 pt-3 pb-3 bg-bg/92 backdrop-blur-xl border-b border-border"
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

      {/* ── Desktop two-pane row ─────────────────────────────────────
          `flex-1 min-h-0` claims the remaining container height so each
          child's `overflow-y-auto` has a definite track to constrain
          to. Without `min-h-0`, flex children default to `min-height:
          auto` (= content size), which silently disables the inner
          scrollbars — the original bug.

          Gated on `isDesktop` (JS) rather than only on `hidden lg:flex`
          (CSS) so the list body — and its IntersectionObserver sentinel
          — render exactly once. Pre-hydration this is `false`, matching
          SSR's mobile-first markup. */}
      {isDesktop && (
        <div className="flex flex-1 min-h-0 gap-[18px] pt-4">
          {/* LEFT — list. Owns its own scrollbar. `min-w-0` allows the
              flex child to shrink below its intrinsic content width when
              the right pane opens. */}
          <div
            ref={listScrollRef}
            className="flex-1 min-w-0 overflow-y-auto pr-1"
          >
            {renderListBody()}
          </div>

          {/* RIGHT — detail / apply / celebration. Conditionally rendered
              so the left list claims full width when nothing is selected.
              Owns its own scrollbar (job-detail's inner `flex-1 min-h-0
              overflow-y-auto` resolves correctly now that this aside has
              a definite height via its `flex-1 min-h-0` row parent). */}
          {selected && (
            <aside className="w-[560px] shrink-0 overflow-y-auto">
              {renderRightPane(selected)}
            </aside>
          )}
        </div>
      )}

      {/* ── Mobile list ──────────────────────────────────────────────
          Natural-document flow at `<lg`. Window-scroll. Sentinel is
          observed against the viewport (`root: null`) per the
          breakpoint media-query effect.

          Also gated on `isDesktop` (JS) — see desktop block above. */}
      {!isDesktop && <div className="mt-4">{renderListBody()}</div>}

      {/* ── Mobile detail / apply / celebration — full-screen overlay ─
          On `<lg`, the right pane replaces the list as a viewport-cover
          overlay. Only rendered when we're actually below the lg
          breakpoint — keeps the DOM lean and avoids any chance of
          stale fixed-position layers above the desktop split. */}
      {!isDesktop && selected && (
        <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
          <div className="min-h-full">{renderRightPane(selected)}</div>
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
    </div>
  );
}
