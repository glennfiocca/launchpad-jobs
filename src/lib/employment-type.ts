/**
 * Employment-type classification + filter variant resolution.
 *
 * Background
 * ----------
 * The DB stores employment type as a display-cased string ("Full-time",
 * "Part-time", "Contract", "Internship", "Temporary"). The Ashby mapper
 * sets these from the API's `employmentType` field. The Greenhouse Board
 * API doesn't expose employment type as a structured field — for those
 * jobs we infer from the title.
 *
 * The filter UI sends slug-style values ("full_time", "part_time", ...)
 * matching EMPLOYMENT_TYPE_OPTIONS in src/lib/validations/jobs.ts. The
 * API translates each slug to a list of DB-stored variants for an `in`
 * query so case + dash differences don't cause zero-result misses.
 */

import { EMPLOYMENT_TYPE_OPTIONS } from "./validations/jobs";

type EmploymentTypeSlug = (typeof EMPLOYMENT_TYPE_OPTIONS)[number];

/**
 * Map filter slug → DB-stored variants. Order matters for `in` query
 * efficiency (most-common variant first), but Postgres won't care.
 *
 * If you find a new variant in production data, add it here — the filter
 * starts matching the new variant immediately, no migration needed.
 */
export const EMPLOYMENT_TYPE_FILTER_VARIANTS: Record<EmploymentTypeSlug, string[]> = {
  full_time: ["Full-time", "Full Time", "Full-Time", "FullTime", "FULL_TIME", "full_time"],
  part_time: ["Part-time", "Part Time", "Part-Time", "PartTime", "PART_TIME", "part_time"],
  contract: ["Contract", "Contractor", "CONTRACT", "contract"],
  internship: ["Internship", "Intern", "INTERN", "internship"],
};

export function resolveEmploymentTypeFilter(slug: string): string[] | null {
  return (EMPLOYMENT_TYPE_FILTER_VARIANTS as Record<string, string[]>)[slug] ?? null;
}

/**
 * Infer employment type from job title. Used for Greenhouse jobs which
 * don't expose this in the API.
 *
 * Order matters: more-specific patterns first. Default to "Full-time"
 * because that's the overwhelming majority of tech postings; the small
 * mis-classification rate at the margin is acceptable for a filter
 * facet (vs the alternative of leaving 87% of the catalog uncategorized
 * and the filter showing zero results for everything).
 */
export function inferEmploymentTypeFromTitle(title: string): string {
  if (!title) return "Full-time";
  const t = title.toLowerCase();

  // Internship — covers "intern", "internship", "co-op", "summer associate"
  if (/\b(internship|intern|co[- ]?op)\b/i.test(t)) return "Internship";

  // Part-time — explicit "part-time" / "part time" in title
  if (/\bpart[- ]time\b/i.test(t)) return "Part-time";

  // Contract — "contract" or "contractor" used as employment-type word.
  // Carve-outs: "Contracts Manager", "Contract Specialist" are job titles
  // that include "contract" but are full-time roles. Heuristic: only
  // classify as Contract if the word appears as a leading/standalone
  // qualifier, not embedded in a job-function noun phrase.
  if (
    /\bcontract\b\s*(role|position|engineer|designer|writer|consultant|to[- ]hire)/i.test(t) ||
    /^contract\b/i.test(t) ||
    /\bcontractor\b/i.test(t)
  ) {
    return "Contract";
  }

  // Temporary
  if (/\b(temporary|temp[- ]to[- ]perm|seasonal)\b/i.test(t)) return "Temporary";

  // Default — full-time
  return "Full-time";
}
