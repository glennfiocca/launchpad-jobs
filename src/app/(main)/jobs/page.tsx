import { Suspense } from "react";
import { JobBoard } from "@/components/jobs/job-board";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  return (
    <div className="bg-black min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Browse Jobs</h1>
          <p className="text-zinc-400 mt-1">Curated listings from top tech companies</p>
        </div>
        <Suspense fallback={<div className="text-zinc-500">Loading jobs...</div>}>
          <JobBoard />
        </Suspense>
      </div>
    </div>
  );
}
