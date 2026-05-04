import Link from "next/link";
import { MapPin, Wifi } from "lucide-react";
import { getRelatedJobs } from "@/lib/jobs/related-jobs";

interface RelatedJobsProps {
  currentJobId: string;
  companyId: string;
  department: string | null;
  /** Defaults to 6. */
  limit?: number;
}

// Hide the section when fewer than this many related roles can be surfaced —
// a sparse list is worse than no list for both UX and SEO (thin content).
const MIN_RESULTS_TO_RENDER = 3;

/**
 * Server Component. Renders a "Related Roles" section under the job detail.
 *
 * Returns null (renders nothing) when fewer than MIN_RESULTS_TO_RENDER
 * candidates exist — keeps the page from showing an empty/spammy section.
 */
export async function RelatedJobs({
  currentJobId,
  companyId,
  department,
  limit,
}: RelatedJobsProps) {
  const jobs = await getRelatedJobs({
    currentJobId,
    companyId,
    department,
    limit,
  });

  if (jobs.length < MIN_RESULTS_TO_RENDER) return null;

  return (
    <section
      aria-labelledby="related-jobs-heading"
      className="mt-12 pt-8 border-t border-white/10"
    >
      <h2
        id="related-jobs-heading"
        className="text-lg font-semibold text-white mb-4"
      >
        Related Roles
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.publicJobId}`}
              className="block bg-zinc-900 border border-white/10 rounded-xl p-4 hover:border-white/20 hover:bg-zinc-900/80 transition-colors"
            >
              <p className="text-sm font-semibold text-white line-clamp-2">
                {job.title}
              </p>
              <p className="text-xs text-zinc-400 mt-1">{job.company.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-zinc-500">
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" aria-hidden />
                    {job.location}
                  </span>
                )}
                {job.remote && (
                  <span className="inline-flex items-center gap-1 text-blue-400">
                    <Wifi className="w-3 h-3" aria-hidden />
                    Remote
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
