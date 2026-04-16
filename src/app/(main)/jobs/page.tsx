import { Suspense } from "react";
import { JobBoard } from "@/components/jobs/job-board";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  return (
    <div className="h-full overflow-hidden bg-black flex flex-col">
      {/* Page header — fixed height, does not scroll */}
      <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-white">Browse Jobs</h1>
        <p className="text-zinc-400 mt-1">Curated listings from top tech companies</p>
      </div>
      {/* JobBoard fills all remaining height */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8 pb-6">
        <Suspense fallback={<div className="text-zinc-500">Loading jobs...</div>}>
          <JobBoard />
        </Suspense>
      </div>
    </div>
  );
}
