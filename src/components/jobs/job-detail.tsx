"use client";

import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { X, MapPin, Building2, Calendar, Wifi, ExternalLink, Zap } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { sanitizeEmployerJobHtml } from "@/lib/sanitize-job-html";
import { ApplyModal } from "@/components/jobs/apply-modal";
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
}

function decodeEntities(html: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

export function JobDetail({ job, hasPriorApplication, onClose, isSaved = false, onSaveToggle }: JobDetailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const { data: session } = useSession();

  const [reportStatus, setReportStatus] = useState<ReportStatus>({ reported: false });

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(job.publicJobId)}/report`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setReportStatus({ reported: data.data.reported, category: data.data.category });
        }
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [job.id, job.publicJobId, session?.user?.id]);

  const decodedContent = useMemo(
    () =>
      job.content
        ? sanitizeEmployerJobHtml(decodeEntities(job.content))
        : null,
    [job.content]
  );
  const [showModal, setShowModal] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isApplyDisabled = applied || hasPriorApplication;

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/8 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/8 flex items-center justify-center text-white font-bold overflow-hidden">
              <CompanyLogo
                name={job.company.name}
                logoUrl={job.company.logoUrl}
                website={job.company.website}
              />
            </div>
            <div>
              <p className="text-sm text-zinc-300">{job.company.name}</p>
              <h2 className="text-xl font-semibold text-white">{job.title}</h2>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
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
              onClick={onClose}
              aria-label="Close job detail"
              className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-3 mb-4">
          {job.location && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <MapPin className="w-4 h-4 text-zinc-500" />
              {job.location}
            </span>
          )}
          {job.remote && (
            <span className="flex items-center gap-1.5 text-sm text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-medium text-xs">
              <Wifi className="w-3.5 h-3.5" />
              Remote
            </span>
          )}
          {job.department && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <Building2 className="w-4 h-4 text-zinc-500" />
              {job.department}
            </span>
          )}
          {job.postedAt && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              <Calendar className="w-4 h-4" />
              {timeAgo(job.postedAt)}
            </span>
          )}
          <span className="text-xs font-mono text-zinc-500 tabular-nums tracking-tight">
            Listing {job.publicJobId ?? job.id}
          </span>
        </div>

        {/* Apply button */}
        {applied ? (
          <div className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold text-sm text-center">
            Applied! Check your dashboard to track progress.
          </div>
        ) : session && hasPriorApplication ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-zinc-800 text-zinc-500 font-semibold text-sm cursor-not-allowed border border-white/10"
            >
              <Zap className="w-4 h-4" />
              One-Click Apply
            </button>
            <p className="text-xs text-zinc-500 text-center">
              You cannot re-apply to this job once an application exists.
            </p>
          </div>
        ) : session ? (
          <div className="space-y-2">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              disabled={isApplyDisabled}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-colors"
            >
              <Zap className="w-4 h-4" />
              One-Click Apply
            </button>
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-transparent border border-white/10 text-zinc-300 text-sm hover:border-white/25 hover:text-white transition-colors"
          >
            Sign in to apply
          </Link>
        )}

        {showModal && (
          <ApplyModal
            job={job}
            onClose={() => setShowModal(false)}
            onApplied={(applicationId, warning) => {
              setShowModal(false);
              setApplied(true);
              if (warning) setError(warning);
            }}
          />
        )}
      </div>

      {/* Job content */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Job description"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
      >
        <div className="p-6">
          {decodedContent ? (
            <div
              key={job.id}
              className="job-content text-sm"
              dangerouslySetInnerHTML={{ __html: decodedContent }}
            />
          ) : (
            <p className="text-zinc-500 text-sm">No description available.</p>
          )}
        </div>
        {job.absoluteUrl && (
          <div className="border-t border-white/8 px-6 py-3 flex justify-end">
            <a
              href={job.absoluteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
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
