"use client";

import { MapPin, Mail } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import type { ApplicationWithJob } from "@/types";

interface ApplicationCardProps {
  application: ApplicationWithJob;
  selected: boolean;
  onClick: () => void;
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  yellow: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  purple: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  orange: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  green: "bg-green-500/10 text-green-400 border border-green-500/20",
  red: "bg-red-500/10 text-red-400 border border-red-500/20",
  gray: "bg-zinc-800 text-zinc-400 border border-zinc-700",
};

export function ApplicationCard({ application, selected, onClick }: ApplicationCardProps) {
  const statusConfig = STATUS_CONFIG[application.status];
  const statusClass = STATUS_BADGE_COLORS[statusConfig.color] ?? STATUS_BADGE_COLORS.gray;
  const hasNewEmail = application.emails.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 cursor-pointer transition-all border-b border-white/5",
        selected
          ? "bg-white/5"
          : "hover:bg-white/3"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Company logo */}
        <div className="rounded-lg bg-white/8 h-9 w-9 flex items-center justify-center text-zinc-400 font-bold text-sm shrink-0 overflow-hidden">
          {application.job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={application.job.company.logoUrl} alt={application.job.company.name} className="w-full h-full object-cover" />
          ) : (
            application.job.company.name.charAt(0)
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-zinc-400 text-sm">{application.job.company.name}</p>
              <p className="text-white font-medium text-sm truncate">{application.job.title}</p>
            </div>
            <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0 font-medium", statusClass)}>
              {statusConfig.label}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-2">
            {application.job.location && (
              <span className="flex items-center gap-1 text-xs text-zinc-600">
                <MapPin className="w-3 h-3" />
                {application.job.location}
              </span>
            )}
            <span className="text-xs text-zinc-600">
              Applied {timeAgo(application.appliedAt)}
            </span>
            {hasNewEmail && (
              <span className="flex items-center gap-1 bg-white/8 text-zinc-400 text-xs rounded-full px-2 py-0.5">
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
