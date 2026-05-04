import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Strict, non-nullable Prisma return type. Drives the JobDetail prop type.
export type JobWithCompany = Prisma.JobGetPayload<{
  include: { company: true };
}>;

/**
 * Fetch a job by its public-facing ID (used in URLs).
 * Returns null when not found — callers should call notFound() in that case.
 *
 * Note: this helper is publicJobId-only by design. Do not fall through to
 * resolve by internal cuid `id`.
 */
export async function getJobByPublicId(
  publicJobId: string
): Promise<JobWithCompany | null> {
  if (!publicJobId) return null;

  return db.job.findUnique({
    where: { publicJobId },
    include: { company: true },
  });
}
