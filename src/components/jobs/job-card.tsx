"use client";

/**
 * JobCard — Phase 4 editorial row.
 *
 * Visual spec: see /tmp/pipeline-jobs-handoff/design_handoff_browse_jobs_manifold/
 *   manifold-prototype.jsx lines 1245-1383 (JobRow).
 *
 * Key behaviors:
 *  - Wrapper is a `<div role="button">` (NOT a `<button>`) so the inner
 *    `<SaveButton>` (also a real button) remains valid HTML and can stop
 *    propagation cleanly. Phase 3's audit flagged the previous nested-button
 *    issue; this rewrite fixes it.
 *  - Selected = lavender inset rail + indigo-tinted bg.
 *  - Match score is mono lavender, right-aligned in the meta row, hidden when
 *    `job.matchScore` is undefined.
 *  - Bricolage display title (font-display), mono micro-copy elsewhere.
 *  - No Share button on the row — Share moved to the detail-pane header icons.
 */

import { useCallback, type KeyboardEvent } from "react";
import { MapPin, Wifi } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { CompanyLogo } from "@/components/company-logo";
import { SaveButton } from "@/components/jobs/save-button";
import type { JobWithCompany } from "@/types";

interface JobCardProps {
  job: JobWithCompany;
  selected: boolean;
  onClick: () => void;
  isSaved?: boolean;
  onSaveToggle?: (jobId: string, saved: boolean) => void;
}

export function JobCard({
  job,
  selected,
  onClick,
  isSaved = false,
  onSaveToggle,
}: JobCardProps) {
  // Keyboard activation parity with native <button>. The wrapper is a div so
  // it does not implicitly handle Enter/Space; do it explicitly.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const hasMatch = typeof job.matchScore === "number";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      className={cn(
        "group relative flex gap-3 rounded-[12px] border px-4 py-3.5 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-lavender/40",
        selected
          ? "bg-[rgba(99,102,241,0.06)] border-[rgba(99,102,241,0.25)] shadow-[inset_2px_0_0_0_var(--color-accent)]"
          : "bg-transparent border-white/[0.05] hover:bg-white/[0.025] hover:border-white/[0.09]",
      )}
    >
      {/* Logo — 36×36, rounded-9 per prototype */}
      <div className="w-9 h-9 rounded-[9px] shrink-0 overflow-hidden bg-white/5 flex items-center justify-center text-white font-bold text-sm">
        <CompanyLogo
          name={job.company.name}
          logoUrl={job.company.logoUrl}
          website={job.company.website}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Top row: company + title (left), posted-ago + save (right) */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] text-text-muted mb-0.5 truncate">
              {job.company.name}
            </p>
            <h3
              className="font-display font-medium text-[14.5px] text-text leading-[1.25] tracking-[-0.01em] truncate"
              title={job.title}
            >
              {job.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {job.createdAt && (
              <span className="font-mono text-[10.5px] text-text-dim tabular-nums">
                {timeAgo(job.createdAt)}
              </span>
            )}
            {/* SaveButton owns its own e.stopPropagation in handleClick.
                Render with variant="card" — its onClick will not bubble to
                the wrapper div, so clicking the bookmark won't select the row. */}
            <SaveButton
              jobId={job.id}
              jobPublicId={job.publicJobId}
              initialSaved={isSaved}
              variant="card"
              onToggle={(saved) => onSaveToggle?.(job.id, saved)}
            />
          </div>
        </div>

        {/* Meta row: pid · location · Remote pill · spacer · match score */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="font-mono text-[10px] text-text-dim tabular-nums">
            {job.publicJobId}
          </span>
          {job.location && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-text-muted">
              <MapPin className="w-[11px] h-[11px] text-text-dim" />
              {job.location}
            </span>
          )}
          {job.remote && (
            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#93c5fd] bg-[rgba(59,130,246,0.12)] border border-[rgba(59,130,246,0.22)] px-[7px] py-px rounded-full">
              <Wifi className="w-[10px] h-[10px]" />
              Remote
            </span>
          )}
          {hasMatch && (
            <span
              className="ml-auto font-mono text-[11.5px] font-medium text-accent-lavender"
              title="Match score — how well this role fits your profile"
            >
              {job.matchScore}% match
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
