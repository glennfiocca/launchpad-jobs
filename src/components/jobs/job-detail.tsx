"use client";

/**
 * JobDetail — Phase 4 editorial pane.
 *
 * Visual spec: see /tmp/pipeline-jobs-handoff/design_handoff_browse_jobs_manifold/
 *   manifold-prototype.jsx lines 1483-1753 (DetailPane).
 *
 * Locked decisions for this phase:
 *  - The job description renders IN FULL, unchanged. The TL;DR sits ABOVE the
 *    original HTML body. The HTML body is never parsed, truncated, or
 *    sectioned. Most explicit user directive in the spec.
 *  - The TL;DR section only renders when `job.summary` is non-null. Old jobs
 *    or sync failures have null summaries — those silently skip the TL;DR
 *    block. No placeholder, no "summary unavailable" string.
 *  - Match score in the meta row only renders when `job.matchScore` is
 *    defined (signed-out users + missing signals → hidden, not "—").
 *  - Velocity cell in the 2×2 stats grid renders `+{N}/wk` when defined and
 *    `—` (em-dash) when undefined.
 *  - "View original listing" link is preserved (uses `job.absoluteUrl`).
 *  - Apply button no longer owns its own modal. Phase 5 lifted the apply
 *    flow to `<JobBoard>`, which renders one of {detail, apply pane,
 *    celebration} in the right column. Clicking Apply here calls
 *    `onRequestApply()` to ask the parent to swap us out.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  ExternalLink,
  MapPin,
  Sparkles,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { sanitizeEmployerJobHtml } from "@/lib/sanitize-job-html";
import { CompanyLogo } from "@/components/company-logo";
import { SaveButton } from "@/components/jobs/save-button";
import { ReportButton } from "@/components/jobs/report-button";
import { ShareButton } from "@/components/jobs/share-button";
import type { JobWithCompany } from "@/types";
import type { ReportCategory } from "@prisma/client";

interface ReportStatus {
  reported: boolean;
  category?: ReportCategory;
}

interface JobDetailProps {
  job: JobWithCompany;
  hasPriorApplication: boolean;
  onClose: () => void;
  isSaved?: boolean;
  onSaveToggle?: (jobId: string, saved: boolean) => void;
  /** Asks the parent to swap this pane for the inline `<ApplyPane>`.
   *  When undefined, the Apply CTA is disabled — kept defensively so
   *  the component still renders if a caller hasn't wired the flow. */
  onRequestApply?: () => void;
}

const ICON_BTN_BASE =
  "inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors";

// Decode HTML entities that survived a stringified `content` field. Used to
// be a top-level helper; kept as a stable module function so it isn't
// recreated per-render.
function decodeEntities(html: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

export function JobDetail({
  job,
  hasPriorApplication,
  onClose,
  isSaved = false,
  onSaveToggle,
  onRequestApply,
}: JobDetailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  // Snap-to-top when switching jobs. Two RAFs to outrun any post-mount
  // layout shifts inside the dangerously-set HTML body.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "instant" });
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.scrollTo({ top: 0, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [job.id]);

  // Per-job report state — fetched on mount + on job change.
  const [reportStatus, setReportStatus] = useState<ReportStatus>({
    reported: false,
  });

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/jobs/${encodeURIComponent(job.publicJobId)}/report`,
        );
        const data = await res.json();
        if (!cancelled && data.success) {
          setReportStatus({
            reported: data.data.reported,
            category: data.data.category,
          });
        }
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id, job.publicJobId, session?.user?.id]);

  const decodedContent = useMemo(
    () =>
      job.content
        ? sanitizeEmployerJobHtml(decodeEntities(job.content))
        : null,
    [job.content],
  );

  const hasMatch = typeof job.matchScore === "number";
  const isApplyDisabled = hasPriorApplication || !onRequestApply;
  const showTldr = Boolean(job.summary);

  return (
    <div className="bg-bg-elev border border-white/[0.06] rounded-[14px] overflow-hidden flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-[22px] pb-[18px] border-b border-white/[0.06] shrink-0">
        <div className="flex items-start gap-3.5">
          {/* Logo — 48×48 */}
          <div className="w-12 h-12 rounded-[12px] shrink-0 overflow-hidden bg-white/5 flex items-center justify-center text-white font-bold">
            <CompanyLogo
              name={job.company.name}
              logoUrl={job.company.logoUrl}
              website={job.company.website}
            />
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] text-text-muted truncate">
                {job.company.name}
              </span>
              <span className="text-[11px] text-text-dim">·</span>
              <span className="font-mono text-[10.5px] text-text-dim tabular-nums">
                {job.publicJobId}
              </span>
            </div>
            <h2 className="font-display font-semibold text-[24px] text-text leading-[1.15] tracking-[-0.025em]">
              {job.title}
            </h2>
          </div>

          {/* Action icons — 30×30 each */}
          <div className="flex items-center gap-1 shrink-0">
            <SaveButton
              jobId={job.id}
              jobPublicId={job.publicJobId}
              initialSaved={isSaved}
              variant="detail"
              onToggle={(saved) => onSaveToggle?.(job.id, saved)}
            />
            <ReportButton
              jobPublicId={job.publicJobId}
              variant="detail"
              initialReported={reportStatus.reported}
              initialReportedCategory={reportStatus.category}
            />
            <ShareButton
              jobPublicId={job.publicJobId}
              jobTitle={job.title}
              companyName={job.company.name}
              variant="detail"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close job detail"
              className={cn(ICON_BTN_BASE, "text-text-dim hover:text-text")}
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-3.5">
          {job.location && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
              <MapPin className="w-[13px] h-[13px] text-text-dim" />
              {job.location}
            </span>
          )}
          {job.remote && (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#93c5fd] bg-[rgba(59,130,246,0.12)] border border-[rgba(59,130,246,0.22)] px-2 py-0.5 rounded-full">
              <Wifi className="w-[11px] h-[11px]" />
              Remote
            </span>
          )}
          {job.department && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
              <Building2 className="w-[13px] h-[13px] text-text-dim" />
              {job.department}
            </span>
          )}
          {job.createdAt && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
              <Calendar className="w-[13px] h-[13px] text-text-dim" />
              {timeAgo(job.createdAt)}
            </span>
          )}
          <span className="flex-1" />
          {hasMatch && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium text-accent-lavender">
              <Sparkles className="w-[12px] h-[12px]" />
              {job.matchScore}% match for you
            </span>
          )}
        </div>

        {/* Apply zone */}
        <div className="mt-4">
          {session && hasPriorApplication ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-[12px] bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.25)] text-accent-light font-display font-medium text-[13.5px]">
                <Zap className="w-4 h-4" />
                Applied · tracking in your pipeline
              </div>
              <p className="text-xs text-text-dim text-center">
                You cannot re-apply to this job once an application exists.
              </p>
            </div>
          ) : session ? (
            <button
              type="button"
              onClick={() => onRequestApply?.()}
              disabled={isApplyDisabled}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-[12px] font-display font-semibold text-[14.5px] transition-transform active:scale-[0.985]",
                "text-bg bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0]",
                "shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
              )}
            >
              <Zap className="w-4 h-4" />
              One-click apply
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-[12px] bg-transparent border border-white/10 text-text-muted text-sm hover:border-white/25 hover:text-text transition-colors"
            >
              Sign in to apply
            </Link>
          )}
        </div>
      </div>

      {/* ── Body — scrollable region ───────────────────────────────── */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Job description"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
      >
        <div className="px-6 py-5">
          {/* TL;DR — only when summary is present. No placeholder otherwise. */}
          {showTldr && (
            <div className="mb-6">
              <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-accent-lavender mb-2">
                TL;DR
              </span>
              <p className="font-display font-normal text-[17px] leading-[1.45] tracking-[-0.015em] text-text [text-wrap:pretty]">
                {job.summary}
              </p>
            </div>
          )}

          {/* 2×2 stats grid */}
          <StatsGrid job={job} />

          {/* Full job description — rendered unchanged. No section parsing,
              no truncation. The original HTML body is the source of truth. */}
          {decodedContent ? (
            <div
              key={job.id}
              className="job-content text-sm"
              dangerouslySetInnerHTML={{ __html: decodedContent }}
            />
          ) : (
            <p className="text-text-dim text-sm">No description available.</p>
          )}
        </div>

        {job.absoluteUrl && (
          <div className="border-t border-white/[0.06] px-6 py-3 flex justify-end">
            <a
              href={job.absoluteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              View original listing
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 2×2 stats grid ──────────────────────────────────────────────────
//
// VELOCITY (cyan, +N/wk or em-dash) · LEVEL · WORK MODE · TEAM.
// Inner borders: right border on left column, bottom border on top row.

const STAT_CELL_BASE =
  "px-3.5 py-3 bg-bg flex flex-col gap-1 min-w-0";
const STAT_LABEL_BASE =
  "font-mono text-[9.5px] uppercase tracking-[0.06em] text-text-dim";
const STAT_VALUE_BASE =
  "font-mono text-[13px] font-medium truncate";

function StatsGrid({ job }: { job: JobWithCompany }) {
  const velocity =
    typeof job.applicationVelocity === "number"
      ? `+${job.applicationVelocity}/wk`
      : "—";

  // Fallback to em-dash for any missing string field — keeps the cell
  // present so the 2×2 grid doesn't visually collapse.
  const level = job.experienceLevel || "—";
  const workMode = job.workMode || (job.remote ? "Remote" : "—");
  const team = job.department || "—";

  return (
    <div className="grid grid-cols-2 border border-white/[0.06] rounded-[12px] overflow-hidden mb-6">
      <div className={cn(STAT_CELL_BASE, "border-r border-b border-white/[0.06]")}>
        <span className={STAT_LABEL_BASE}>Velocity</span>
        <span className={cn(STAT_VALUE_BASE, "text-accent-cyan")}>
          {velocity}
        </span>
      </div>
      <div className={cn(STAT_CELL_BASE, "border-b border-white/[0.06]")}>
        <span className={STAT_LABEL_BASE}>Level</span>
        <span className={cn(STAT_VALUE_BASE, "text-text capitalize")}>
          {level}
        </span>
      </div>
      <div className={cn(STAT_CELL_BASE, "border-r border-white/[0.06]")}>
        <span className={STAT_LABEL_BASE}>Work mode</span>
        <span className={cn(STAT_VALUE_BASE, "text-text capitalize")}>
          {workMode}
        </span>
      </div>
      <div className={STAT_CELL_BASE}>
        <span className={STAT_LABEL_BASE}>Team</span>
        <span className={cn(STAT_VALUE_BASE, "text-text")}>{team}</span>
      </div>
    </div>
  );
}
