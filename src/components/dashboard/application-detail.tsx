"use client";

import { useState, useRef, useEffect } from "react";
import { X, MapPin, Calendar, ExternalLink } from "lucide-react";
import { EmailThread } from "./email-thread";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import { STATUS_BADGE_STYLES } from "@/lib/styles";
import { CompanyLogo } from "@/components/company-logo";
import type { ApplicationWithJob } from "@/types";
import type { ApplicationStatus } from "@prisma/client";

interface ApplicationDetailProps {
  application: ApplicationWithJob;
  onClose: () => void;
  onApplicationUpdate?: (updated: ApplicationWithJob) => void;
}

type Tab = "overview" | "emails" | "timeline";

const TERMINAL_STATUSES: ApplicationStatus[] = ["WITHDRAWN", "LISTING_REMOVED", "REJECTED", "OFFER"];

export function ApplicationDetail({ application, onClose, onApplicationUpdate }: ApplicationDetailProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [application.id]);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const statusConfig = STATUS_CONFIG[application.status];

  const NEXT_STEPS: Partial<Record<ApplicationStatus, string>> = {
    APPLIED: "Wait for the recruiter to review your application. Usually takes 1–2 weeks.",
    REVIEWING: "Your application is being reviewed. Prepare to hear back soon.",
    PHONE_SCREEN: "Schedule or prepare for your phone/video screen with the recruiter.",
    INTERVIEWING: "You're in the interview process! Prep thoroughly and send thank-you notes.",
    OFFER: "Review the offer carefully. Negotiate if needed. Respond within the deadline.",
    REJECTED: "Don't be discouraged. Request feedback and keep applying.",
    WITHDRAWN: "You've withdrawn from this opportunity.",
  };

  const isTerminal = TERMINAL_STATUSES.includes(application.status);

  async function handleWithdraw() {
    setIsWithdrawing(true);
    setWithdrawError(null);
    try {
      const res = await fetch(`/api/applications/${application.id}`, { method: "DELETE" });
      const json = await res.json() as { success: boolean; data?: ApplicationWithJob; error?: string };
      if (json.success && json.data) {
        onApplicationUpdate?.(json.data);
      } else {
        setWithdrawError(json.error ?? "Failed to withdraw application.");
      }
    } catch {
      setWithdrawError("Network error. Please try again.");
    }
    setIsWithdrawing(false);
    setConfirmingWithdraw(false);
  }

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/8">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Company logo */}
            <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center text-zinc-400 font-bold overflow-hidden shrink-0">
              <CompanyLogo
                name={application.job.company.name}
                logoUrl={application.job.company.logoUrl}
                website={application.job.company.website}
              />
            </div>
            <div>
              <p className="text-zinc-300 text-xs">{application.job.company.name}</p>
              <h2 className="text-white text-lg font-semibold">{application.job.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status badge + next steps */}
        {(() => {
          const style = STATUS_BADGE_STYLES[statusConfig.color] ?? STATUS_BADGE_STYLES.gray;
          return (
            <div className={cn("rounded-xl px-3 py-2.5 mb-3", style.badge)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", style.badge)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot, style.pulse && "animate-status-pulse")} />
                  {statusConfig.label}
                </span>
                <span className="text-xs opacity-70">{formatDate(application.appliedAt)}</span>
              </div>
              <p className="text-xs opacity-80">{NEXT_STEPS[application.status]}</p>
            </div>
          );
        })()}

        {/* LISTING_REMOVED informational banner */}
        {application.status === "LISTING_REMOVED" && (
          <div className="bg-amber-500/8 border border-amber-500/20 text-amber-200 text-xs px-4 py-3 rounded-xl mb-3">
            This job listing has been removed by the employer. Your application is no longer being reviewed.
          </div>
        )}

        {/* Withdraw button / confirm flow */}
        {!isTerminal && (
          <div className="flex items-center gap-2 mt-2">
            {!confirmingWithdraw ? (
              <button
                onClick={() => setConfirmingWithdraw(true)}
                className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all"
              >
                Withdraw
              </button>
            ) : (
              <>
                <span className="text-xs text-zinc-400">Are you sure?</span>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {isWithdrawing ? "Withdrawing…" : "Yes, withdraw"}
                </button>
                <button
                  onClick={() => { setConfirmingWithdraw(false); setWithdrawError(null); }}
                  disabled={isWithdrawing}
                  className="text-xs text-zinc-400 hover:text-zinc-200 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/8 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        {/* Withdraw error */}
        {withdrawError && (
          <p className="text-xs text-red-400 mt-2">{withdrawError}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-zinc-400 text-sm mt-3">
          {application.job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {application.job.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Applied {timeAgo(application.appliedAt)}
          </span>
          {application.job.absoluteUrl && (
            <a
              href={application.job.absoluteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View job
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/8 px-6">
        {(["overview", "emails", "timeline"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors",
              tab === t
                ? "text-white border-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t}
            {t === "emails" && application.emails.length > 0 && (
              <span className="ml-1 bg-white/10 text-zinc-300 text-xs rounded-full px-1.5 py-0.5">
                {application.emails.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5">
        {tab === "overview" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2">Tracking Email</h3>
              <div className="bg-black border border-white/10 rounded-xl p-3 font-mono text-zinc-300 text-sm break-all">
                {application.trackingEmail ?? "Not assigned"}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Forward recruiting emails here to auto-track status.
              </p>
            </div>
            {application.userNotes && (
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2">Notes</h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{application.userNotes}</p>
              </div>
            )}
            {application.externalApplicationId && (
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2">Application ID</h3>
                <p className="text-xs font-mono text-zinc-400">{application.externalApplicationId}</p>
              </div>
            )}
          </div>
        )}

        {tab === "emails" && (
          <EmailThread
            applicationId={application.id}
            initialEmails={application.emails}
            readOnly={application.status === "LISTING_REMOVED" || application.status === "WITHDRAWN"}
          />
        )}

        {tab === "timeline" && (
          <div className="space-y-3">
            {application.statusHistory.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No history yet</p>
            ) : (
              <div className="relative">
                {/* Connector line */}
                <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />
                <div className="space-y-4">
                  {application.statusHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className="w-6 h-6 rounded-full bg-white/8 border border-white/15 shrink-0 z-10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white">
                            {STATUS_CONFIG[entry.toStatus].label}
                          </p>
                          <span className="text-xs text-zinc-500">{timeAgo(entry.createdAt)}</span>
                        </div>
                        {entry.reason && <p className="text-xs text-zinc-500 mt-0.5">{entry.reason}</p>}
                        <p className="text-xs text-zinc-500">via {entry.triggeredBy}</p>
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
