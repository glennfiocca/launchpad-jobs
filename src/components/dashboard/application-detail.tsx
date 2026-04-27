"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
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

type Tab = "overview" | "messages" | "timeline";

const TABS: readonly Tab[] = ["overview", "messages", "timeline"] as const;

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  messages: "Messages",
  timeline: "Timeline",
};

const TERMINAL_STATUSES: ApplicationStatus[] = ["WITHDRAWN", "LISTING_REMOVED", "REJECTED", "OFFER"];

const NEXT_STEPS: Partial<Record<ApplicationStatus, string>> = {
  APPLIED: "Wait for the recruiter to review your application. Usually takes 1–2 weeks.",
  REVIEWING: "Your application is being reviewed. Prepare to hear back soon.",
  PHONE_SCREEN: "Schedule or prepare for your phone/video screen with the recruiter.",
  INTERVIEWING: "You're in the interview process! Prep thoroughly and send thank-you notes.",
  OFFER: "Review the offer carefully. Negotiate if needed. Respond within the deadline.",
  REJECTED: "Don't be discouraged. Request feedback and keep applying.",
  WITHDRAWN: "You've withdrawn from this opportunity and cannot re-apply to this job.",
};

export function ApplicationDetail({ application, onClose, onApplicationUpdate }: ApplicationDetailProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const tablistRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset tab to overview when switching applications
  useEffect(() => {
    setTab("overview");
    setConfirmingWithdraw(false);
    setWithdrawError(null);
  }, [application.id]);

  // Scroll panel to top when tab changes
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, application.id]);

  // Keyboard navigation for tabs (arrow keys, Home, End)
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.indexOf(tab);
    let nextIndex: number | null = null;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextTab = TABS[nextIndex];
    setTab(nextTab);

    // Focus the newly active tab button
    const tablist = tablistRef.current;
    if (tablist) {
      const buttons = tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons[nextIndex]?.focus();
    }
  }, [tab]);

  const statusConfig = STATUS_CONFIG[application.status];
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
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Region A: Compact sticky header ──────────────────────────────── */}
      <div className="shrink-0 px-5 py-3 border-b border-white/8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center text-zinc-400 font-bold overflow-hidden shrink-0">
              <CompanyLogo
                name={application.job.company.name}
                logoUrl={application.job.company.logoUrl}
                website={application.job.company.website}
              />
            </div>
            <div className="min-w-0">
              <p className="text-zinc-400 text-xs truncate">{application.job.company.name}</p>
              <h2 className="text-white text-sm font-semibold truncate">{application.job.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Region B: Tab bar (a11y tablist) ─────────────────────────────── */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Application details"
        className="shrink-0 flex border-b border-white/8 px-5"
      >
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`tabpanel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={handleTabKeyDown}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0a] rounded-t-sm",
              tab === t
                ? "text-white border-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {TAB_LABELS[t]}
            {t === "messages" && application.emails.length > 0 && (
              <span className="ml-1.5 bg-white/10 text-zinc-300 text-xs rounded-full px-1.5 py-0.5">
                {application.emails.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Region C: Tab panel (fills remaining height, scrolls internally) */}
      <div
        ref={panelRef}
        id={`tabpanel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      >
        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="p-5 space-y-4">
            {/* Status badge + next steps */}
            {(() => {
              const style = STATUS_BADGE_STYLES[statusConfig.color] ?? STATUS_BADGE_STYLES.gray;
              return (
                <div className={cn("rounded-xl px-3 py-2.5", style.badge)}>
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
              <div className="bg-amber-500/8 border border-amber-500/20 text-amber-200 text-xs px-4 py-3 rounded-xl">
                This job listing has been removed by the employer. Your application is no longer being reviewed.
              </div>
            )}

            {/* Submission failed banner */}
            {!application.externalApplicationId && application.submissionStatus === "FAILED" && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                <span className="font-medium">Submission failed.</span>{" "}
                {application.submissionError
                  ? application.submissionError
                  : "Auto-submit did not complete."}{" "}
                Apply manually via the job listing.
              </div>
            )}

            {/* Submission pending banner */}
            {!application.externalApplicationId && application.submissionStatus === "PENDING" && (
              <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                <span className="font-medium">Submission in progress.</span>{" "}
                Your application is being submitted to Greenhouse. This may take up to a minute.
              </div>
            )}

            {/* Withdraw button / confirm flow */}
            {!isTerminal && (
              <div className="flex items-center gap-2">
                {!confirmingWithdraw ? (
                  <button
                    onClick={() => setConfirmingWithdraw(true)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all"
                  >
                    Withdraw
                  </button>
                ) : (
                  <>
                    <span className="text-xs text-zinc-400">
                      This is final. You will not be able to re-apply to this job.
                    </span>
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
              <p className="text-xs text-red-400">{withdrawError}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap gap-3 text-zinc-400 text-sm">
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
              <span className="text-[10px] font-mono text-zinc-500 tabular-nums tracking-tight shrink-0">
                {application.job.publicJobId ?? application.job.id}
              </span>
              <Link
                href={`/jobs?job=${encodeURIComponent(application.job.publicJobId ?? application.job.id)}`}
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View job
              </Link>
            </div>

            {/* Messages captured indicator */}
            {application.emails.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-300/80">
                  {application.emails.length} message{application.emails.length !== 1 ? "s" : ""} captured
                </span>
              </div>
            )}

            {/* Notes */}
            {application.userNotes && (
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2">Notes</h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{application.userNotes}</p>
              </div>
            )}

            {/* External application ID */}
            {application.externalApplicationId && (
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-2">Application ID</h3>
                <p className="text-xs font-mono text-zinc-400">{application.externalApplicationId}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        {tab === "messages" && (
          <div className="p-5 h-full">
            <EmailThread
              applicationId={application.id}
              initialEmails={application.emails}
              readOnly={application.status === "LISTING_REMOVED" || application.status === "WITHDRAWN"}
            />
          </div>
        )}

        {/* ── Timeline ─────────────────────────────────────────────────────── */}
        {tab === "timeline" && (
          <div className="p-5">
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
