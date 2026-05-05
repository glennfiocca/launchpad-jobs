/**
 * Toggleable US-eligibility filter for the listing API.
 *
 * The platform's primary audience is American workers. The default browse
 * surface (homepage, search, feed, facets) hides jobs whose location
 * classifier flagged them as foreign-only. Detail pages and the sitemap
 * remain unfiltered so SEO and direct traffic from search engines is
 * preserved.
 *
 * The filter is gated behind an env flag so it can be flipped instantly
 * (set JOBS_US_ELIGIBLE_FILTER=false to roll back without a code deploy).
 */

import { Prisma } from "@prisma/client";

/**
 * Returns true if the US-only filter should be applied to the listing API.
 * Default: true. Set JOBS_US_ELIGIBLE_FILTER=false to disable.
 */
export function isUSEligibleFilterEnabled(): boolean {
  const raw = process.env.JOBS_US_ELIGIBLE_FILTER;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}

/**
 * Prisma where-clause fragment to merge into structuralWhere. Spread it
 * directly into the where object — returns an empty object when the filter
 * is disabled so the call site stays the same in both states.
 */
export function usEligibleWhere(): Prisma.JobWhereInput {
  if (!isUSEligibleFilterEnabled()) return {};
  return { isUSEligible: true };
}

/**
 * Raw-SQL counterpart for the FTS + relevance paths in src/app/api/jobs/route.ts.
 * Returns null when the filter is disabled so the caller can conditionally
 * push it onto the conditions array.
 */
export function usEligibleSqlCondition(): Prisma.Sql | null {
  if (!isUSEligibleFilterEnabled()) return null;
  return Prisma.sql`j."isUSEligible" = true`;
}
