"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { X, MapPin, Building2, Calendar, Wifi, ExternalLink, Zap, Loader2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { JobWithCompany } from "@/types";

interface JobDetailProps {
  job: JobWithCompany;
  onClose: () => void;
}

export function JobDetail({ job, onClose }: JobDetailProps) {
  const { data: session } = useSession();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!session) return;
    setApplying(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (data.success) {
        setApplied(true);
      } else {
        setError(data.error ?? "Failed to apply");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 h-[calc(100vh-8rem)] overflow-hidden flex flex-col sticky top-24">
      {/* Header */}
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold overflow-hidden">
              {job.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-cover" />
              ) : (
                job.company.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-sm text-slate-500">{job.company.name}</p>
              <h2 className="text-xl font-bold text-slate-900">{job.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mb-4">
          {job.location && (
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              {job.location}
            </span>
          )}
          {job.remote && (
            <span className="flex items-center gap-1.5 text-sm text-blue-600">
              <Wifi className="w-4 h-4" />
              Remote
            </span>
          )}
          {job.department && (
            <span className="flex items-center gap-1.5 text-sm text-slate-600">
              <Building2 className="w-4 h-4 text-slate-400" />
              {job.department}
            </span>
          )}
          {job.postedAt && (
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <Calendar className="w-4 h-4" />
              {timeAgo(job.postedAt)}
            </span>
          )}
        </div>

        {/* Apply button */}
        {applied ? (
          <div className="w-full py-3 px-4 rounded-xl bg-green-50 border border-green-200 text-green-700 font-semibold text-sm text-center">
            Applied! Check your dashboard to track progress.
          </div>
        ) : session ? (
          <div className="space-y-2">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              onClick={handleApply}
              disabled={applying}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  One-Click Apply
                </>
              )}
            </button>
            {job.absoluteUrl && (
              <a
                href={job.absoluteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on Greenhouse
              </a>
            )}
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Sign in to apply
          </Link>
        )}
      </div>

      {/* Job content */}
      <div className="flex-1 overflow-y-auto p-6">
        {job.content ? (
          <div
            className="job-content text-sm"
            dangerouslySetInnerHTML={{ __html: job.content }}
          />
        ) : (
          <p className="text-slate-400 text-sm">No description available.</p>
        )}
      </div>
    </div>
  );
}
