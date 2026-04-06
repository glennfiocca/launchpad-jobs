"use client";

import { MapPin, Wifi } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { JobWithCompany } from "@/types";

interface JobCardProps {
  job: JobWithCompany;
  selected: boolean;
  onClick: () => void;
}

export function JobCard({ job, selected, onClick }: JobCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-white rounded-xl border transition-all p-4 hover:shadow-sm",
        selected
          ? "border-blue-500 shadow-sm ring-1 ring-blue-500"
          : "border-slate-200 hover:border-slate-300"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-bold text-sm overflow-hidden">
          {job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-cover" />
          ) : (
            job.company.name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">{job.company.name}</p>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">{job.title}</h3>
            </div>
            {job.postedAt && (
              <span className="text-xs text-slate-400 shrink-0">{timeAgo(job.postedAt)}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {job.location && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="w-3 h-3" />
                {job.location}
              </span>
            )}
            {job.remote && (
              <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                <Wifi className="w-3 h-3" />
                Remote
              </span>
            )}
            {job.department && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {job.department}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
