import { Suspense } from "react";
import { JobBoard } from "@/components/jobs/job-board";

export const dynamic = "force-dynamic";

/**
 * Browse Jobs entry point — Phase 3 of the editorial redesign.
 *
 * The page is a natural-document block (no `flex-1 min-h-0` chain). Scrolling
 * is owned by the window, mirroring the dashboard pattern. JobBoard renders
 * its own sticky filter shell + two-pane grid; this file just provides the
 * canonical content-area frame (`max-w-[1480px] mx-auto px-7`).
 */
export default function JobsPage() {
  return (
    <div className="max-w-[1480px] mx-auto px-7 pt-5 pb-6">
      <Suspense fallback={<div className="text-text-dim">Loading jobs...</div>}>
        <JobBoard />
      </Suspense>
    </div>
  );
}
