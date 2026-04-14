"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { JobFilters as FiltersBar } from "./job-filters";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import type { JobWithCompany, JobFilters, ApiResponse } from "@/types";
import { Loader2 } from "lucide-react";

const LIMIT = 20;

export function JobBoard() {
  const [jobs, setJobs] = useState<JobWithCompany[]>([]);
  const [selected, setSelected] = useState<JobWithCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<JobFilters>({});

  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const hasAnimatedRef = useRef(false);

  const hasMore = jobs.length < total;
  hasMoreRef.current = hasMore;

  const loadNextPage = useCallback(() => {
    if (isFetchingRef.current || !hasMoreRef.current) return;
    isFetchingRef.current = true;
    setPage(p => p + 1);
  }, []);

  // After each fetch, re-trigger intersection check in case sentinel is still in viewport
  const recheckSentinel = useCallback(() => {
    const observer = observerRef.current;
    const sentinel = sentinelRef.current;
    if (!observer || !sentinel) return;
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }, []);

  const fetchJobs = useCallback(async (f: JobFilters, p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);

    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (f.query) params.set("query", f.query);
    if (f.location) params.set("location", f.location);
    if (f.department) params.set("department", f.department);
    if (f.company) params.set("company", f.company);
    if (f.remote) params.set("remote", "true");
    if (f.employmentType) params.set("employmentType", f.employmentType);

    try {
      const res = await fetch(`/api/jobs?${params}`);
      const data: ApiResponse<JobWithCompany[]> = await res.json();
      if (data.success && data.data) {
        setJobs(prev => replace ? data.data! : [...prev, ...data.data!]);
        setTotal(data.meta?.total ?? 0);
      }
    } catch {
      // non-fatal
    } finally {
      isFetchingRef.current = false;
      if (replace) setLoading(false);
      else setLoadingMore(false);
      // Re-evaluate intersection in case sentinel is still in viewport after load
      recheckSentinel();
    }
  }, [recheckSentinel]);

  // Observer set up once — sentinel is always mounted so ref is valid immediately
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadNextPage();
      },
      { rootMargin: "300px" }
    );

    observer.observe(sentinel);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [loadNextPage]);

  // Filter change: reset and fetch fresh page 1
  useEffect(() => {
    isFetchingRef.current = false;
    setPage(1);
    fetchJobs(filters, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Page increment from scroll: fetch next page and append
  useEffect(() => {
    if (page === 1) return;
    fetchJobs(filters, page, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleFiltersChange = (f: JobFilters) => {
    setFilters(f);
    setSelected(null);
  };

  return (
    <div className="flex gap-6">
      {/* Left: filters + list */}
      <div className={`flex-1 min-w-0 ${selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
        <FiltersBar filters={filters} onChange={handleFiltersChange} />

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-slate-400 text-lg">No jobs found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-3">{total.toLocaleString()} jobs found</p>
            <div className="space-y-2">
              {jobs.map((job, index) => {
                const shouldAnimate = !hasAnimatedRef.current && index < 10;
                if (index === jobs.length - 1 && !hasAnimatedRef.current) {
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
                      delay: shouldAnimate ? Math.min(index * 0.04, 0.4) : 0,
                    }}
                  >
                    <JobCard
                      job={job}
                      selected={selected?.id === job.id}
                      onClick={() => setSelected(job)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {/*
          Sentinel is ALWAYS rendered (outside the loading/empty conditionals) so
          the IntersectionObserver can attach on first mount. The observer only
          fires on intersection *changes*, so recheckSentinel() forces re-evaluation
          after each fetch in case sentinel is still in viewport.
        */}
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {loadingMore && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
          {!loading && !loadingMore && !hasMore && jobs.length > 0 && (
            <p className="text-xs text-slate-400">All {total.toLocaleString()} jobs loaded</p>
          )}
        </div>
      </div>

      {/* Right: job detail panel */}
      {selected && (
        <div className="w-full lg:w-[560px] shrink-0">
          <JobDetail job={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
