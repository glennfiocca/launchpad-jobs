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

/**
 * Toggleable Full-time-only filter, applied alongside US-eligibility on the
 * listing surface. Audience-curation rationale matches: the platform targets
 * full-time job seekers, so part-time / contract / internship / temporary
 * postings (~1.7% of the catalog) are hidden from listing + facets. Sitemap
 * + detail pages stay unfiltered so direct deeplinks still resolve.
 *
 * Set JOBS_FULL_TIME_ONLY=false to roll back without a code deploy.
 */
export function isFullTimeOnlyFilterEnabled(): boolean {
  const raw = process.env.JOBS_FULL_TIME_ONLY;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}

// Mirrors EMPLOYMENT_TYPE_FILTER_VARIANTS["full_time"] in src/lib/employment-type.ts
// — duplicated locally to avoid an import cycle (this module is imported by
// the listing API + facets, which are perf-sensitive paths).
const FULL_TIME_VARIANTS = ["Full-time", "Full Time", "Full-Time", "FullTime", "FULL_TIME", "full_time"] as const;

export function fullTimeOnlyWhere(): Prisma.JobWhereInput {
  if (!isFullTimeOnlyFilterEnabled()) return {};
  return { employmentType: { in: [...FULL_TIME_VARIANTS] } };
}

export function fullTimeOnlySqlCondition(): Prisma.Sql | null {
  if (!isFullTimeOnlyFilterEnabled()) return null;
  return Prisma.sql`j."employmentType" = ANY(${[...FULL_TIME_VARIANTS]})`;
}
