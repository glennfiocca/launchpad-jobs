/**
 * Experience-level classification + listing-filter gate.
 *
 * Background
 * ----------
 * Neither Greenhouse Board API nor Ashby Posting API expose seniority as a
 * structured field, so we infer it from the job title at sync time. The
 * resulting slug is stored in `Job.experienceLevel` (canonical, no display
 * variants) and consumed by the listing API, facets, and the chip filter UI.
 *
 * Slugs are stored in the DB as-is; the case-mismatch bug we hit with
 * employmentType (display strings stored, slugs sent from the UI) does not
 * apply here — UI slugs match DB slugs exactly.
 *
 * Heuristic precedence
 * --------------------
 * Level words take precedence over management words, in order:
 *   1. entry  (junior, jr, associate, entry-level, new grad, graduate)
 *   2. senior (senior, sr.)
 *   3. staff  (staff, principal, distinguished, fellow, lead-engineer-style)
 *   4. management (vp, svp, evp, director, head of, chief, c-suite, manager)
 *   5. mid    (default — overwhelmingly the unmatched majority)
 *
 * Examples:
 *   "Senior Engineering Manager" → senior     (NOT management)
 *   "Staff Software Engineer"    → staff
 *   "VP of Engineering"          → management
 *   "Junior Product Manager"     → entry
 *   "Lead Engineer"              → staff
 *   "Lead Generation Specialist" → mid        (carve-out: lead-as-noun)
 */

export const EXPERIENCE_LEVEL_OPTIONS = [
  "entry",
  "mid",
  "senior",
  "staff",
  "management",
] as const;

export type ExperienceLevelSlug = (typeof EXPERIENCE_LEVEL_OPTIONS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevelSlug, string> = {
  entry: "Entry-level",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff/Principal",
  management: "Management",
};

// Precompiled — modules are loaded once but the heuristic runs per-job during
// sync, so avoid rebuilding the regex on every call.
const ENTRY_RE =
  /(\bjunior\b|\bjr\.?\b|\bassociate\b|\bentry[- ]level\b|\bnew\s+grad\b|\bgraduate\b)/i;
const SENIOR_RE = /(\bsenior\b|\bsr\.?\b)/i;
// Staff-class:
//   - explicit staff/principal/distinguished/fellow words
//   - "Lead <engineering noun>" — only when "lead" is the leading word and
//     followed by a clearly-engineering noun. "Lead Generation Specialist"
//     should NOT trip this (lead is a noun there, not a level).
const STAFF_RE =
  /(\bstaff\b|\bprincipal\b|\bdistinguished\b|\bfellow\b|^lead\s+(engineer|designer|developer|analyst|architect|scientist|writer))/i;
const MANAGEMENT_RE =
  /(\bvp\b|\bsvp\b|\bevp\b|\bdirector\b|\bhead\s+of\b|\bchief\b|\bc[etfopm]o\b|\bmanager\b)/i;

/**
 * Infer experience-level slug from a job title. Returns one of
 * EXPERIENCE_LEVEL_OPTIONS — never null. Empty / whitespace title → "mid".
 */
export function inferExperienceLevelFromTitle(title: string): ExperienceLevelSlug {
  if (!title) return "mid";
  const t = title.trim();
  if (!t) return "mid";

  if (ENTRY_RE.test(t)) return "entry";
  if (SENIOR_RE.test(t)) return "senior";
  if (STAFF_RE.test(t)) return "staff";
  if (MANAGEMENT_RE.test(t)) return "management";
  return "mid";
}

/**
 * Returns true if the experience-level filter should be applied to listing +
 * facet responses. Default: true. Set JOBS_EXPERIENCE_FILTER=false to roll
 * back without a code deploy.
 *
 * Server-side only. The UI uses the NEXT_PUBLIC_-prefixed twin
 * (isExperienceFilterEnabledClient) which is bundled into the client.
 */
export function isExperienceFilterEnabled(): boolean {
  const raw = process.env.JOBS_EXPERIENCE_FILTER;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}

/**
 * Client-bundled twin of isExperienceFilterEnabled(). Reads
 * NEXT_PUBLIC_JOBS_EXPERIENCE_FILTER which Next inlines at build time. Default
 * true (so the chip strip is visible by default; flipping the var to "false"
 * + redeploy hides it).
 */
export function isExperienceFilterEnabledClient(): boolean {
  const raw = process.env.NEXT_PUBLIC_JOBS_EXPERIENCE_FILTER;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}
