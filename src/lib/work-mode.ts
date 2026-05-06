/**
 * Work-mode classification + listing-filter gate.
 *
 * Background
 * ----------
 * Neither Greenhouse Board API nor Ashby Posting API expose a structured
 * "work mode" field that distinguishes Remote vs Hybrid vs On-site. The
 * Ashby `isRemote` boolean flags fully-remote jobs but says nothing about
 * hybrid; Greenhouse offers no signal at all. We infer the slug from a
 * combination of `title`, `location`, and `content` at sync time and store
 * it in `Job.workMode` (canonical slug, no display variants) — consumed by
 * the listing API, facets, and the segmented chip UI.
 *
 * Heuristic precedence
 * --------------------
 * Hybrid is MORE specific than Remote (a hybrid posting often mentions
 * "remote" too — e.g. "Hybrid - 3 days remote, 2 days in office"), so we
 * check hybrid signals first.
 *
 *   1. hybrid — any of:
 *        * /\bhybrid\b/i in title or location
 *        * "<N> days (per week) in (the) office" anywhere in content
 *        * "<N> days on-site" anywhere in content
 *   2. remote — only if step 1 didn't match:
 *        * location is exactly "Remote" (case-insensitive trimmed)
 *        * location starts with /^remote\b/i — covers "Remote", "Remote - US",
 *          "Remote, US"
 *        * location ends with /\(remote\)/i — covers "United States (Remote)"
 *        * remote: true AND location is null/empty
 *   3. onsite — default for everything else.
 *
 * Known mis-classifications (acceptable):
 *   "NY, Remote" → onsite (Remote not at start of string, not in trailing
 *   parens). Affects ~900 prod rows; deemed not worth a more-permissive
 *   heuristic that would over-classify "Sydney, Remote roles available"-
 *   style listings.
 */

export const WORK_MODE_OPTIONS = ["remote", "hybrid", "onsite"] as const;

export type WorkModeSlug = (typeof WORK_MODE_OPTIONS)[number];

export const WORK_MODE_LABELS: Record<WorkModeSlug, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

// Precompiled — modules are loaded once but the heuristic runs per-job during
// sync, so avoid rebuilding the regex on every call.
const HYBRID_WORD_RE = /\bhybrid\b/i;
// "(N|one|two|three|four|five) days (per week) in (the) office" — lets us
// pick up hybrid signals from the body of postings whose title/location
// doesn't say "hybrid" outright.
const HYBRID_DAYS_OFFICE_RE =
  /\b(\d+|one|two|three|four|five)\s*days?\s*(per\s*week\s*)?in[- ]?(the\s*)?office\b/i;
const HYBRID_DAYS_ONSITE_RE =
  /\b(\d+|one|two|three|four|five)\s*days?\s*on[- ]?site\b/i;

// Remote-location patterns. Order matters less here because they're all
// disjoint, but we list strict-equality first for clarity.
const REMOTE_EXACT_RE = /^remote$/i;
// "Remote", "Remote - US", "Remote, US", "Remote — Europe". Matches when
// "Remote" is the leading word, followed by a delimiter or end-of-string.
const REMOTE_PREFIX_RE = /^remote\b/i;
// "United States (Remote)" — parenthesized "remote" at end of string.
const REMOTE_TRAILING_PAREN_RE = /\(remote\)\s*$/i;

export interface InferWorkModeInput {
  title?: string;
  location?: string | null;
  content?: string | null;
  remote?: boolean;
}

/**
 * Infer the work-mode slug from a job's signal fields. Always returns one of
 * WORK_MODE_OPTIONS — never null. Defaults to "onsite" when no remote/hybrid
 * signal is present.
 */
export function inferWorkModeFromJob(input: InferWorkModeInput): WorkModeSlug {
  const title = (input.title ?? "").trim();
  const location = (input.location ?? "").trim();
  const content = input.content ?? "";

  // 1. Hybrid — most specific, checked first. A hybrid posting frequently
  //    contains the word "remote" too (e.g. "Hybrid: 3 days remote"), so
  //    matching remote first would mis-classify these.
  if (HYBRID_WORD_RE.test(location)) return "hybrid";
  if (HYBRID_WORD_RE.test(title)) return "hybrid";
  if (content) {
    if (HYBRID_DAYS_OFFICE_RE.test(content)) return "hybrid";
    if (HYBRID_DAYS_ONSITE_RE.test(content)) return "hybrid";
  }

  // 2. Remote — only if no hybrid signal matched.
  if (location) {
    if (REMOTE_EXACT_RE.test(location)) return "remote";
    if (REMOTE_PREFIX_RE.test(location)) return "remote";
    if (REMOTE_TRAILING_PAREN_RE.test(location)) return "remote";
  } else if (input.remote === true) {
    // Empty/null location plus the legacy `remote: true` flag — fall back to
    // remote so jobs with no location text but a true remote bit still classify
    // correctly. Many legacy syncs populated `remote` without a location.
    return "remote";
  }

  // 3. On-site — default.
  return "onsite";
}

/**
 * Returns true if the work-mode filter should be applied to listing + facet
 * responses. Default: true. Set JOBS_WORK_MODE_FILTER=false to roll back
 * without a code deploy.
 *
 * Server-side only. The UI uses the NEXT_PUBLIC_-prefixed twin
 * (isWorkModeFilterEnabledClient) which is bundled into the client.
 */
export function isWorkModeFilterEnabled(): boolean {
  const raw = process.env.JOBS_WORK_MODE_FILTER;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}

/**
 * Client-bundled twin of isWorkModeFilterEnabled(). Reads
 * NEXT_PUBLIC_JOBS_WORK_MODE_FILTER which Next inlines at build time. Default
 * true (so the segment is visible by default; flipping the var to "false" +
 * redeploy hides it).
 */
export function isWorkModeFilterEnabledClient(): boolean {
  const raw = process.env.NEXT_PUBLIC_JOBS_WORK_MODE_FILTER;
  if (raw === undefined) return true;
  return raw !== "false" && raw !== "0";
}
