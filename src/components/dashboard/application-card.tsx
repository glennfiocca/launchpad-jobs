"use client";

import { MapPin, Mail } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import { STATUS_BADGE_STYLES } from "@/lib/styles";
import { CompanyLogo } from "@/components/company-logo";
import type { ApplicationWithJob } from "@/types";

interface ApplicationCardProps {
  application: ApplicationWithJob;
  selected: boolean;
  onClick: () => void;
}

export function ApplicationCard({ application, selected, onClick }: ApplicationCardProps) {
  const statusConfig = STATUS_CONFIG[application.status];
  const style = STATUS_BADGE_STYLES[statusConfig.color] ?? STATUS_BADGE_STYLES.gray;
  const hasNewEmail = application.emails.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 cursor-pointer transition-all border-b border-white/5 relative",
        selected
          ? "bg-white/5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-indigo-500 before:rounded-r-full"
          : "hover:bg-white/3",
        application.status === "LISTING_REMOVED" && "opacity-75"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="rounded-lg bg-white/8 h-9 w-9 flex items-center justify-center text-zinc-400 font-bold text-sm shrink-0 overflow-hidden">
          <CompanyLogo
            name={application.job.company.name}
            logoUrl={application.job.company.logoUrl}
            website={application.job.company.website}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-zinc-300 text-sm">{application.job.company.name}</p>
              <p className="text-white font-medium text-sm truncate">{application.job.title}</p>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full shrink-0 font-medium", style.badge)}>
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot, style.pulse && "animate-status-pulse")} />
              {statusConfig.label}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums tracking-tight">
              {application.job.publicJobId}
            </span>
            {application.job.location && (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="w-3 h-3" />
                {application.job.location}
              </span>
            )}
            <span className="text-xs text-zinc-500">
              Applied {timeAgo(application.appliedAt)}
            </span>
            {hasNewEmail && (
              <span className="flex items-center gap-1 bg-white/8 text-zinc-300 text-xs rounded-full px-2 py-0.5">
                <Mail className="w-3 h-3" />
                {application.emails.length} email{application.emails.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
