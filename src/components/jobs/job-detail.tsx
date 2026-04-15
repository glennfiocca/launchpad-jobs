"use client";

import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { X, MapPin, Building2, Calendar, Wifi, ExternalLink, Zap } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { ApplyModal } from "@/components/jobs/apply-modal";
import { CompanyLogo } from "@/components/company-logo";
import type { JobWithCompany } from "@/types";

interface JobDetailProps {
  job: JobWithCompany;
  onClose: () => void;
}

function decodeEntities(html: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

export function JobDetail({ job, onClose }: JobDetailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Immediate reset on job change
    el.scrollTo({ top: 0, behavior: "instant" });
    // Double rAF: fires after paint + after layout stabilizes (fonts, images)
    let rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        el.scrollTo({ top: 0, behavior: "instant" });
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [job.id]);

  const { data: session } = useSession();
  const decodedContent = useMemo(
    () => (job.content ? decodeEntities(job.content) : null),
    [job.content]
  );
  const [showModal, setShowModal] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/8">
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
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white hover:bg-white/8 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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
        </div>

        {/* Apply button */}
        {applied ? (
          <div className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold text-sm text-center">
            Applied! Check your dashboard to track progress.
          </div>
        ) : session ? (
          <div className="space-y-2">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-colors"
            >
              <Zap className="w-4 h-4" />
              One-Click Apply
            </button>
            {job.absoluteUrl && (
              <a
                href={job.absoluteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-transparent border border-white/10 text-zinc-300 text-sm hover:border-white/25 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on Greenhouse
              </a>
            )}
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6">
        {decodedContent ? (
          <div
            className="job-content text-sm"
            dangerouslySetInnerHTML={{ __html: decodedContent }}
          />
        ) : (
          <p className="text-zinc-500 text-sm">No description available.</p>
        )}
      </div>
    </div>
  );
}
