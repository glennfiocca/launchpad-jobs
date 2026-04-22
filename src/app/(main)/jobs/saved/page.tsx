"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Bookmark, Loader2, MapPin, Wifi, ExternalLink } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { SaveButton } from "@/components/jobs/save-button";
import { ShareButton } from "@/components/jobs/share-button";
import { timeAgo } from "@/lib/utils";
import type { ApiResponse, JobWithCompany } from "@/types";

interface SavedJobEntry {
  savedAt: string;
  job: JobWithCompany;
}

export default function SavedJobsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [entries, setEntries] = useState<SavedJobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchSaved = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/saved?limit=50");
      const data: ApiResponse<SavedJobEntry[]> = await res.json();
      if (data.success && data.data) {
        setEntries(data.data);
        setTotal(data.meta?.total ?? data.data.length);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchSaved();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [sessionStatus, fetchSaved]);

  const handleSaveToggle = useCallback((jobId: string, saved: boolean) => {
    if (!saved) {
      setEntries((prev) => prev.filter((e) => e.job.id !== jobId));
      setTotal((prev) => Math.max(0, prev - 1));
    }
  }, []);

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <Bookmark className="w-10 h-10 text-zinc-600 mb-3" />
        <h2 className="text-lg font-semibold text-white mb-1">Sign in to view saved jobs</h2>
        <p className="text-zinc-400 text-sm mb-4">Save jobs while browsing to keep track of listings you like.</p>
        <Link
          href="/auth/signin"
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-100 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Saved Jobs</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            {loading ? "Loading…" : `${total} saved listing${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Bookmark className="w-10 h-10 text-zinc-600 mb-3" />
            <h2 className="text-lg font-semibold text-white mb-1">No saved jobs yet</h2>
            <p className="text-zinc-400 text-sm mb-4">
              Browse listings and click the bookmark icon to save jobs for later.
            </p>
            <Link
              href="/jobs"
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-100 transition-colors"
            >
              Browse Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(({ savedAt, job }) => (
              <div
                key={job.id}
                className="bg-[#0a0a0a] border border-white/8 rounded-xl p-4 hover:border-white/12 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center shrink-0 overflow-hidden">
                    <CompanyLogo
                      name={job.company.name}
                      logoUrl={job.company.logoUrl}
                      website={job.company.website}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-zinc-400 mb-0.5">{job.company.name}</p>
                        <Link
                          href={`/jobs?job=${encodeURIComponent(job.publicJobId)}`}
                          className="text-sm font-semibold text-white hover:text-indigo-300 transition-colors leading-tight"
                        >
                          {job.title}
                        </Link>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <SaveButton
                          jobId={job.id}
                          jobPublicId={job.publicJobId}
                          initialSaved
                          variant="card"
                          onToggle={(saved) => handleSaveToggle(job.id, saved)}
                        />
                        <ShareButton
                          jobPublicId={job.publicJobId}
                          jobTitle={job.title}
                          companyName={job.company.name}
                          variant="card"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {job.location && (
                        <span className="flex items-center gap-1 text-xs text-zinc-400">
                          <MapPin className="w-3 h-3 text-zinc-500" />
                          {job.location}
                        </span>
                      )}
                      {job.remote && (
                        <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                          <Wifi className="w-3 h-3" />
                          Remote
                        </span>
                      )}
                      {job.department && (
                        <span className="text-xs text-zinc-300 bg-white/8 border border-white/10 px-2 py-0.5 rounded-full">
                          {job.department}
                        </span>
                      )}
                      <span className="text-xs text-zinc-600">
                        Saved {timeAgo(new Date(savedAt))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-600 tabular-nums">
                    {job.publicJobId}
                  </span>
                  {job.absoluteUrl && (
                    <a
                      href={job.absoluteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View original
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
