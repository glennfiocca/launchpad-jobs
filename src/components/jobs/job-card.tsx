"use client";

import { MapPin, Wifi } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { CompanyLogo } from "@/components/company-logo";
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
        "w-full text-left rounded-xl border transition-all p-4 relative overflow-hidden",
        selected
          ? "bg-white/5 border-indigo-500/30 ring-1 ring-indigo-500/15 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-indigo-500 before:rounded-r-full"
          : "bg-[#0a0a0a] border-white/8 hover:bg-white/3 hover:border-white/12"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center shrink-0 text-white font-bold text-sm overflow-hidden">
          <CompanyLogo
            name={job.company.name}
            logoUrl={job.company.logoUrl}
            website={job.company.website}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-zinc-300 mb-0.5">{job.company.name}</p>
              <h3 className="text-sm font-semibold text-white leading-tight">{job.title}</h3>
            </div>
            {job.postedAt && (
              <span className="text-xs text-zinc-500 shrink-0">{timeAgo(job.postedAt)}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums tracking-tight">
              {job.publicJobId}
            </span>
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
          </div>
        </div>
      </div>
    </button>
  );
}
