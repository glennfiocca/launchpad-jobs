import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Narrow projection — only the fields RelatedJobs renders. Keeps the response
// payload small and makes the contract explicit at the type level.
const RELATED_JOB_SELECT = {
  id: true,
  publicJobId: true,
  title: true,
  location: true,
  remote: true,
  department: true,
  company: { select: { name: true, slug: true } },
} satisfies Prisma.JobSelect;

export type RelatedJob = Prisma.JobGetPayload<{ select: typeof RELATED_JOB_SELECT }>;

export interface GetRelatedJobsInput {
  currentJobId: string;
  companyId: string;
  department: string | null;
  /** Defaults to 6. Caller controls how many results to render. */
  limit?: number;
}

const DEFAULT_LIMIT = 6;

/**
 * Resolve "related" jobs for the detail-page sidebar.
 *
 * Ranking strategy (most-relevant first):
 *   1. Same company + same department
 *   2. Same company (any department)
 *   3. Same department (any company)
 *
 * We fetch each tier independently, dedupe by job id, then take the first
 * `limit` results. Each tier is bounded to `limit` rows so the upper bound
 * on rows fetched is `3 * limit` — small and predictable.
 *
 * The currentJobId is excluded from every tier. Inactive jobs are excluded.
 */
export async function getRelatedJobs(
  input: GetRelatedJobsInput,
): Promise<RelatedJob[]> {
  const { currentJobId, companyId, department } = input;
  const limit = input.limit ?? DEFAULT_LIMIT;

  if (limit <= 0) return [];

  const baseExclude = {
    isActive: true,
    NOT: { id: currentJobId },
  } satisfies Prisma.JobWhereInput;

  // Tier 1 — same company + same department. Skipped when no department is set.
  const tier1Promise = department
    ? db.job.findMany({
        where: { ...baseExclude, companyId, department },
        orderBy: { postedAt: "desc" },
        take: limit,
        select: RELATED_JOB_SELECT,
      })
    : Promise.resolve<RelatedJob[]>([]);

  // Tier 2 — same company, any department.
  const tier2Promise = db.job.findMany({
    where: { ...baseExclude, companyId },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: RELATED_JOB_SELECT,
  });

  // Tier 3 — same department, any company. Skipped when no department is set.
  const tier3Promise = department
    ? db.job.findMany({
        where: { ...baseExclude, department },
        orderBy: { postedAt: "desc" },
        take: limit,
        select: RELATED_JOB_SELECT,
      })
    : Promise.resolve<RelatedJob[]>([]);

  const [tier1, tier2, tier3] = await Promise.all([
    tier1Promise,
    tier2Promise,
    tier3Promise,
  ]);

  const seen = new Set<string>();
  const merged: RelatedJob[] = [];
  for (const tier of [tier1, tier2, tier3]) {
    for (const job of tier) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      merged.push(job);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}
