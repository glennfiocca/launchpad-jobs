"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { ApplyModal } from "@/components/jobs/apply-modal";
import type { JobWithCompany } from "@/lib/jobs/get-job";

interface JobApplyButtonProps {
  job: JobWithCompany;
}

/**
 * Smallest possible client island for the detail page apply CTA.
 * Reuses the same ApplyModal flow as the listing page.
 *
 * - Signed out: link to /auth/signin with callbackUrl returning here.
 * - Signed in: open the existing ApplyModal.
 */
export function JobApplyButton({ job }: JobApplyButtonProps) {
  const { data: session, status } = useSession();
  const [showModal, setShowModal] = useState(false);
  const [applied, setApplied] = useState(false);

  const callbackUrl = `/jobs/${encodeURIComponent(job.publicJobId)}`;

  if (status === "loading") {
    // Reserve height to avoid CLS while session resolves.
    return (
      <div className="w-full h-[44px] rounded-xl bg-white/5 border border-white/10 animate-pulse" />
    );
  }

  if (applied) {
    return (
      <div className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold text-sm text-center">
        Applied! Check your dashboard to track progress.
      </div>
    );
  }

  if (!session) {
    return (
      <Link
        href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 transition-colors"
      >
        <Zap className="w-4 h-4" />
        Apply with Pipeline
        <span aria-hidden>&rarr;</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 transition-colors"
      >
        <Zap className="w-4 h-4" />
        Apply with Pipeline
        <span aria-hidden>&rarr;</span>
      </button>
      {showModal && (
        <ApplyModal
          job={job}
          onClose={() => setShowModal(false)}
          onApplied={() => {
            setShowModal(false);
            setApplied(true);
          }}
        />
      )}
    </>
  );
}
