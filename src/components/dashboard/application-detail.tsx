"use client";

import { useState } from "react";
import { X, MapPin, Calendar, ExternalLink } from "lucide-react";
import { EmailThread } from "./email-thread";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import type { ApplicationWithJob } from "@/types";
import type { ApplicationStatus } from "@prisma/client";

interface ApplicationDetailProps {
  application: ApplicationWithJob;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  yellow: "bg-yellow-50 text-yellow-700",
  purple: "bg-purple-50 text-purple-700",
  orange: "bg-orange-50 text-orange-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-slate-50 text-slate-600",
};

type Tab = "overview" | "emails" | "timeline";

export function ApplicationDetail({ application, onClose }: ApplicationDetailProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const statusConfig = STATUS_CONFIG[application.status];
  const statusColorClass = STATUS_COLORS[statusConfig.color];

  const NEXT_STEPS: Partial<Record<ApplicationStatus, string>> = {
    APPLIED: "Wait for the recruiter to review your application. Usually takes 1–2 weeks.",
    REVIEWING: "Your application is being reviewed. Prepare to hear back soon.",
    PHONE_SCREEN: "Schedule or prepare for your phone/video screen with the recruiter.",
    INTERVIEWING: "You're in the interview process! Prep thoroughly and send thank-you notes.",
    OFFER: "Review the offer carefully. Negotiate if needed. Respond within the deadline.",
    REJECTED: "Don't be discouraged. Request feedback and keep applying.",
    WITHDRAWN: "You've withdrawn from this opportunity.",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 h-[calc(100vh-8rem)] overflow-hidden flex flex-col sticky top-24">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold overflow-hidden">
              {application.job.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={application.job.company.logoUrl} alt={application.job.company.name} className="w-full h-full object-cover" />
              ) : (
                application.job.company.name.charAt(0)
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500">{application.job.company.name}</p>
              <h2 className="text-base font-bold text-slate-900">{application.job.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status badge + next steps */}
        <div className={cn("rounded-lg px-3 py-2.5 mb-3", statusColorClass)}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide">{statusConfig.label}</span>
            <span className="text-xs opacity-70">{formatDate(application.appliedAt)}</span>
          </div>
          <p className="text-xs opacity-80">{NEXT_STEPS[application.status]}</p>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {application.job.location && (
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{application.job.location}</span>
          )}
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Applied {timeAgo(application.appliedAt)}</span>
          {application.job.absoluteUrl && (
            <a href={application.job.absoluteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
              <ExternalLink className="w-3 h-3" />View job
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-5">
        {(["overview", "emails", "timeline"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t}
            {t === "emails" && application.emails.length > 0 && (
              <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                {application.emails.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "overview" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tracking Email</h3>
              <div className="bg-slate-50 rounded-lg p-3 text-xs font-mono text-slate-600 break-all">
                {application.trackingEmail ?? "Not assigned"}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Forward recruiting emails here to auto-track status.
              </p>
            </div>
            {application.userNotes && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notes</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{application.userNotes}</p>
              </div>
            )}
            {application.externalApplicationId && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Application ID</h3>
                <p className="text-xs font-mono text-slate-600">{application.externalApplicationId}</p>
              </div>
            )}
          </div>
        )}

        {tab === "emails" && (
          <EmailThread
            applicationId={application.id}
            initialEmails={application.emails}
          />
        )}

        {tab === "timeline" && (
          <div className="space-y-3">
            {application.statusHistory.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No history yet</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
                <div className="space-y-4">
                  {application.statusHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-400 shrink-0 z-10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">
                            {STATUS_CONFIG[entry.toStatus].label}
                          </p>
                          <span className="text-xs text-slate-400">{timeAgo(entry.createdAt)}</span>
                        </div>
                        {entry.reason && <p className="text-xs text-slate-500 mt-0.5">{entry.reason}</p>}
                        <p className="text-xs text-slate-400">via {entry.triggeredBy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
