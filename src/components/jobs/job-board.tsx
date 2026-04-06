"use client";

import { useState, useCallback, useEffect } from "react";
import { JobFilters as FiltersBar } from "./job-filters";
import { JobCard } from "./job-card";
import { JobDetail } from "./job-detail";
import type { JobWithCompany, JobFilters, ApiResponse } from "@/types";
import { Loader2 } from "lucide-react";

export function JobBoard() {
  const [jobs, setJobs] = useState<JobWithCompany[]>([]);
  const [selected, setSelected] = useState<JobWithCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<JobFilters>({});
  const limit = 20;

  const fetchJobs = useCallback(async (f: JobFilters, p: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.query) params.set("query", f.query);
    if (f.location) params.set("location", f.location);
    if (f.department) params.set("department", f.department);
    if (f.company) params.set("company", f.company);
    if (f.remote) params.set("remote", "true");
    if (f.employmentType) params.set("employmentType", f.employmentType);
    params.set("page", String(p));
    params.set("limit", String(limit));

    try {
      const res = await fetch(`/api/jobs?${params}`);
      const data: ApiResponse<JobWithCompany[]> = await res.json();
      if (data.success && data.data) {
        setJobs(data.data);
        setTotal(data.meta?.total ?? 0);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(filters, page);
  }, [filters, page, fetchJobs]);

  const handleFiltersChange = (f: JobFilters) => {
    setFilters(f);
    setPage(1);
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
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  onClick={() => setSelected(job)}
                />
              ))}
            </div>

            {/* Pagination */}
            {total > limit && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  Page {page} of {Math.ceil(total / limit)}
                </span>
                <button
                  disabled={page >= Math.ceil(total / limit)}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
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
