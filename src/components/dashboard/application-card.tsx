"use client";

import { MapPin, Mail } from "lucide-react";
import { cn, timeAgo, formatDate } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import type { ApplicationWithJob } from "@/types";

interface ApplicationCardProps {
  application: ApplicationWithJob;
  selected: boolean;
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  gray: "bg-slate-50 text-slate-600 border-slate-200",
};

export function ApplicationCard({ application, selected, onClick }: ApplicationCardProps) {
  const statusConfig = STATUS_CONFIG[application.status];
  const statusClass = STATUS_COLORS[statusConfig.color] ?? STATUS_COLORS.gray;
  const hasNewEmail = application.emails.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-white rounded-xl border transition-all p-4",
        selected
          ? "border-blue-500 shadow-sm ring-1 ring-blue-500"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0 overflow-hidden">
          {application.job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={application.job.company.logoUrl} alt={application.job.company.name} className="w-full h-full object-cover" />
          ) : (
            application.job.company.name.charAt(0)
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500">{application.job.company.name}</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{application.job.title}</p>
            </div>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border shrink-0 font-medium", statusClass)}>
              {statusConfig.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2">
            {application.job.location && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="w-3 h-3" />
                {application.job.location}
              </span>
            )}
            <span className="text-xs text-slate-400">
              Applied {timeAgo(application.appliedAt)}
            </span>
            {hasNewEmail && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
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
