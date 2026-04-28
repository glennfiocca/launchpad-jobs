import { Suspense } from "react";
import { JobBoard } from "@/components/jobs/job-board";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  return (
    <div className="h-full overflow-hidden bg-black flex flex-col">
      {/* JobBoard fills all remaining height */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <Suspense fallback={<div className="text-zinc-500">Loading jobs...</div>}>
          <JobBoard />
        </Suspense>
      </div>
    </div>
  );
}
