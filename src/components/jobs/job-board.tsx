"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { JobFilters as FiltersBar } from "./job-filters";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import { useJobFilters } from "@/hooks/use-job-filters";
import type { JobWithCompany, JobFacets, ApiResponse, ApplicationWithJob } from "@/types";
import { Loader2 } from "lucide-react";

const LIMIT = 20;

function jobMatchesUrlParam(job: JobWithCompany, param: string): boolean {
  if (job.id === param) return true;
  if (!job.publicJobId) return false;
  return job.publicJobId.toLowerCase() === param.toLowerCase();
}

export function JobBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { filters } = useJobFilters();
  const jobIdFromUrl = searchParams.get("job");

  const [jobs, setJobs] = useState<JobWithCompany[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<JobWithCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [facets, setFacets] = useState<JobFacets | undefined>();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const jobsRef = useRef<JobWithCompany[]>([]);
  jobsRef.current = jobs;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const hasAnimatedRef = useRef(false);

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
      if (replace) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (f.query) params.set("query", f.query);
      if (f.locationCity) params.set("locationCity", f.locationCity);
      if (f.locationState) params.set("locationState", f.locationState);
      if (!f.locationCity && f.location) params.set("location", f.location);
      if (f.department) params.set("department", f.department);
      if (f.company) params.set("company", f.company);
      if (f.remote) params.set("remote", "true");
      if (f.employmentType) params.set("employmentType", f.employmentType);
      if (f.datePosted && f.datePosted !== "any")
        params.set("datePosted", f.datePosted);
      if (f.salaryMin !== undefined) params.set("salaryMin", String(f.salaryMin));
      if (f.salaryMax !== undefined) params.set("salaryMax", String(f.salaryMax));
      if (f.sort) params.set("sort", f.sort);

      try {
        const res = await fetch(`/api/jobs?${params}`);
        const data: ApiResponse<JobWithCompany[]> = await res.json();
        if (data.success && data.data) {
          const newTotal = data.meta?.total ?? 0;
          if (replace) {
            setJobs(data.data);
            hasAnimatedRef.current = false;
            hasMoreRef.current = data.data.length < newTotal;
          } else {
            setJobs((prev) => {
              const existingIds = new Set(prev.map((j) => j.id));
              const merged = [...prev, ...data.data!.filter((j) => !existingIds.has(j.id))];
              hasMoreRef.current = merged.length < newTotal;
              return merged;
            });
          }
          setTotal(newTotal);
          if (data.meta?.facets) setFacets(data.meta.facets);
        }
      } catch {
        // non-fatal
      } finally {
        isFetchingRef.current = false;
        if (replace) setLoading(false);
        else setLoadingMore(false);
        recheckSentinel();
      }
    },
    [recheckSentinel]
  );

  // Observer set up once
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const list = listRef.current;
    if (!sentinel || !list) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadNextPage();
      },
      { root: list, rootMargin: "300px" }
    );

    observer.observe(sentinel);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadNextPage]);

  // Filter change: reset to page 1 and fetch fresh.
  // Use a stable string key derived from searchParams minus the ?job= param so
  // that selecting/deselecting a job (which only mutates ?job=) does not trigger
  // a spurious page-1 reset and list replacement.
  const filterKey = new URLSearchParams(
    [...searchParams.entries()].filter(([k]) => k !== "job")
  ).toString();

  useEffect(() => {
    isFetchingRef.current = false;
    setPage(1);
    fetchJobs(filtersRef.current, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Page increment from infinite scroll: append next page
  // Use filtersRef to avoid stale closure — filters may change between renders
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

  const handleSaveToggle = useCallback((jobId: string, saved: boolean) => {
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (saved) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  }, []);

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
      // Preserve all active filter params — only set the job param
      const params = new URLSearchParams(searchParams.toString());
      params.set("job", encodeURIComponent(slug));
      router.replace(`/jobs?${params}`, { scroll: false });
    },
    [router, searchParams]
  );

  const closeDetail = useCallback(() => {
    setSelected(null);
    // Preserve all active filter params — only remove the job param
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="h-full flex gap-6">
      {/* Left: filters + list */}
      <div
        className={`flex-1 min-w-0 min-h-0 flex flex-col ${
          selected ? "hidden lg:flex" : "flex"
        }`}
      >
        <FiltersBar facets={facets} />

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        >
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-slate-400 text-lg">No jobs found</p>
              <p className="text-slate-400 text-sm mt-1">
                Try adjusting your filters
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                {total.toLocaleString()} jobs found
              </p>
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
            </>
          )}

          <div ref={sentinelRef} className="py-4 flex justify-center">
            {loadingMore && (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            )}
            {!loading && !loadingMore && !hasMore && jobs.length > 0 && (
              <p className="text-xs text-slate-400">
                All {total.toLocaleString()} jobs loaded
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right: job detail */}
      {selected && (
        <div className="w-full lg:w-[560px] shrink-0 min-h-0 h-full">
          <JobDetail
            job={selected}
            hasPriorApplication={appliedJobIds.has(selected.id)}
            onClose={closeDetail}
            isSaved={savedJobIds.has(selected.id)}
            onSaveToggle={handleSaveToggle}
          />
        </div>
      )}
    </div>
  );
}
