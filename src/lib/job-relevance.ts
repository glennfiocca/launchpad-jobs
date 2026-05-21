import { Prisma } from "@prisma/client";
import { EMPLOYMENT_TYPE_FILTER_VARIANTS } from "./employment-type";

/** Profile fields relevant to relevance scoring -- fetched from UserProfile. */
export interface RelevanceProfile {
  locationCity: string | null;
  locationState: string | null;
  openToRemote: boolean;
  /** New (P0 #4). Optional for back-compat with callers that pre-date the column. */
  openToHybrid?: boolean;
  openToOnsite: boolean;
  currentTitle: string | null;
  fieldOfStudy: string | null;
  /** New (P0 #3). Drives the experience-level distance penalty. May come from
   *  the scalar UserProfile column OR the resumeExtracted JSONB fallback —
   *  the caller (api/jobs/route.ts) decides. */
  yearsExperience?: number | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  // Phase 5 additions (additive — empty arrays are treated as "no preference").
  targetRoles: string[];
  desiredEmploymentTypes: string[];
  /** New (P0 #2). User skill names, used to build a ts_rank tsquery against
   *  `Job.searchVector`. Optional for callers that don't fetch the relation. */
  skillNames?: string[];
  /** New (P0 #1). Lowercased spoken-language slugs the user knows. Used to
   *  decide whether a job's `requiredLanguages` overlap is satisfied. */
  spokenLanguages?: string[];
}

// Cap on cumulative `targetRoles` boost to prevent keyword-stuffing the title.
// 2 matching keywords saturate it; further matches are ignored.
const TARGET_ROLE_BOOST_PER_MATCH = 15;
const TARGET_ROLE_BOOST_CAP = 30;
const EMPLOYMENT_TYPE_BOOST = 10;

// Work-mode signal weights (P0 #4). Mutually exclusive per row — one of the
// three CASE branches fires depending on the job's workMode slug.
const WORK_MODE_REMOTE_BOOST = 20;
const WORK_MODE_HYBRID_BOOST = 15;
const WORK_MODE_ONSITE_BOOST = 10;

// Skills ts_rank (P0 #2). ts_rank returns a small float (~0..1 typically),
// scaled by SKILLS_RANK_MULT and capped via LEAST() so it can't dominate.
const SKILLS_RANK_MULT = 30;
const SKILLS_BOOST_CAP = 30;

// Experience-level distance penalty (P0 #3). Same level: 0. One step: -5.
// Two or more steps: -15. Applied via GREATEST(0, raw - penalty) on the
// outside so it can drop a score (never inflate it).
const LEVEL_DISTANCE_PENALTY_1 = 5;
const LEVEL_DISTANCE_PENALTY_2PLUS = 15;

// Missing-required-language penalty (P0 #1). Steep on purpose — by the time
// language lands in Job.requiredLanguages, the extractor already filtered
// out preferences, so it's effectively a hard gate. -40 reliably pushes the
// job below the visibility cutoff for any reasonable signal mix.
const LANGUAGE_MISSING_PENALTY = 40;

// Per-signal max contributions — kept in sync with buildProfileScoreParts.
// Used by computeMaxRawScore to derive the per-request normalization ceiling
// (so /api/jobs can map raw scores → 0–100). Centralized here so the score
// expression and the ceiling never drift.
const SIGNAL_MAX = {
  city: 25,
  state: 10,
  // workMode max — only one of remote/hybrid/onsite can fire per row, so the
  // ceiling is the largest of whichever the user opted into.
  workMode: WORK_MODE_REMOTE_BOOST,
  salaryMin: 10,
  salaryMax: 10,
  targetRoles: TARGET_ROLE_BOOST_CAP,
  employmentType: EMPLOYMENT_TYPE_BOOST,
  skills: SKILLS_BOOST_CAP,
  recency: 15,
} as const;

// Experience-level slugs in canonical order. Index = step distance.
// Mirrors src/lib/experience-level.ts EXPERIENCE_LEVEL_OPTIONS.
const LEVEL_ORDER = ["entry", "mid", "senior", "staff", "management"] as const;
type Level = (typeof LEVEL_ORDER)[number];

/** Fallback ORDER BY when no profile signals are available. */
const RECENCY_FALLBACK = Prisma.sql`j."createdAt" DESC NULLS LAST`;

/**
 * Recency boost: newer jobs get up to 15 bonus points, decaying 1 pt/day.
 * Jobs older than 15 days receive 0.
 */
const RECENCY_BOOST = Prisma.sql`GREATEST(0, 15 - EXTRACT(DAY FROM NOW() - j."createdAt"))`;

/**
 * Map a year count to the expected experience-level slug. Mirrors the
 * heuristic from the audit spec — boundaries are inclusive on the low end.
 * Caller passes through null (or undefined) to mean "no penalty".
 */
function yearsToLevel(years: number): Level {
  if (years < 2) return "entry";
  if (years < 5) return "mid";
  if (years < 10) return "senior";
  return "staff";
}

/**
 * Escape Postgres POSIX regex metacharacters in user-supplied input so that
 * `~*` ('\m' || pattern || '\M')` is a syntactically valid regex.
 * Word-boundary anchors (\m, \M) are added by the caller, not the user.
 */
function escapeRegex(input: string): string {
  return input.replace(/[\\.^$*+?()[\]{}|]/g, "\\$&");
}

/**
 * Build a `to_tsquery`-compatible OR-of-skills string. Strips non-word chars
 * inside each skill (so "C++" → "C", "Node.js" → "Node js" → "Node & js")
 * and drops empties. Returns null when nothing survives.
 *
 * Each skill becomes a phrase chunk joined by `&` (AND inside a phrase) and
 * the chunks are OR-joined with `|`. Single-word skills emit as a bare token.
 */
function buildSkillsTsquery(skills: ReadonlyArray<string>): string | null {
  const chunks: string[] = [];
  for (const raw of skills) {
    const cleaned = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim();
    if (!cleaned) continue;
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) continue;
    chunks.push(words.length === 1 ? words[0] : `(${words.join(" & ")})`);
  }
  if (chunks.length === 0) return null;
  return chunks.join(" | ");
}

/**
 * Resolve a list of hyphenated employment-type slugs ("full-time", etc.) to
 * the flat DB-variant list ("Full-time", "FULL_TIME", …). Maps via
 * EMPLOYMENT_TYPE_FILTER_VARIANTS (which keys on underscored slugs); unknown
 * slugs fall through verbatim so a future slug doesn't silently zero-match.
 */
function resolveEmploymentVariants(slugs: ReadonlyArray<string>): string[] {
  const out = new Set<string>();
  for (const slug of slugs) {
    const key = slug.replace(/-/g, "_");
    const variants = (EMPLOYMENT_TYPE_FILTER_VARIANTS as Record<string, string[] | undefined>)[key];
    if (variants) {
      for (const v of variants) out.add(v);
    } else {
      // Unknown slug — preserve original so an exact match still works.
      out.add(slug);
    }
  }
  return Array.from(out);
}

/** Assemble profile-based scoring fragments from a RelevanceProfile. */
function buildProfileScoreParts(profile: RelevanceProfile): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];

  // -- 1. Location match (city +25, state +10) --
  // Word-boundary regex (P0 #5): \m...\M anchors prevent "NY" from matching
  // "Sunnyvale" and "Austin" from matching "Austinburg". Escape user input
  // so a stray paren or bracket doesn't blow up the regex.
  if (profile.locationCity) {
    const cityRegex = `\\m${escapeRegex(profile.locationCity)}\\M`;
    parts.push(
      Prisma.sql`CASE WHEN j."location" ~* ${cityRegex} THEN 25 ELSE 0 END`
    );
  }
  if (profile.locationState) {
    const stateRegex = `\\m${escapeRegex(profile.locationState)}\\M`;
    parts.push(
      Prisma.sql`CASE WHEN j."location" ~* ${stateRegex} THEN 10 ELSE 0 END`
    );
  }

  // -- 2. Work-mode preference (P0 #4). One branch fires per row; the others
  //       evaluate to 0. The legacy j."remote" boolean is intentionally not
  //       consulted — workMode supersedes it for matching. --
  const wmBranches: Prisma.Sql[] = [];
  if (profile.openToRemote) {
    wmBranches.push(
      Prisma.sql`WHEN j."workMode" = 'remote' THEN ${WORK_MODE_REMOTE_BOOST}`
    );
  }
  if (profile.openToHybrid) {
    wmBranches.push(
      Prisma.sql`WHEN j."workMode" = 'hybrid' THEN ${WORK_MODE_HYBRID_BOOST}`
    );
  }
  if (profile.openToOnsite) {
    wmBranches.push(
      Prisma.sql`WHEN j."workMode" = 'onsite' THEN ${WORK_MODE_ONSITE_BOOST}`
    );
  }
  if (wmBranches.length > 0) {
    parts.push(Prisma.sql`CASE ${Prisma.join(wmBranches, " ")} ELSE 0 END`);
  }

  // -- 3. Salary overlap (up to 20 pts: 10 per bound) --
  if (profile.desiredSalaryMin !== null) {
    parts.push(
      Prisma.sql`CASE WHEN j."salaryMax" >= ${profile.desiredSalaryMin} THEN 10 ELSE 0 END`
    );
  }
  if (profile.desiredSalaryMax !== null) {
    parts.push(
      Prisma.sql`CASE WHEN j."salaryMin" <= ${profile.desiredSalaryMax} THEN 10 ELSE 0 END`
    );
  }

  // -- 4. Target-role title match (up to +30 total) --
  // For each keyword, +15 if it appears as a case-insensitive whole-word
  // match against j."title". Word-boundary (\m...\M) prevents "engineer"
  // from matching "Reverse Engineer". Sum across keywords is capped via
  // LEAST(..., 30) so a profile listing 5 overlapping keywords doesn't
  // dominate the score.
  if (profile.targetRoles.length > 0) {
    const perKeywordParts: Prisma.Sql[] = profile.targetRoles.map((kw) => {
      const roleRegex = `\\m${escapeRegex(kw)}\\M`;
      return Prisma.sql`CASE WHEN j."title" ~* ${roleRegex} THEN ${TARGET_ROLE_BOOST_PER_MATCH} ELSE 0 END`;
    });
    const sumExpr = Prisma.join(perKeywordParts, " + ");
    parts.push(Prisma.sql`LEAST(${TARGET_ROLE_BOOST_CAP}, ${sumExpr})`);
  }

  // -- 5. Employment-type preference (+10 if match, otherwise 0) --
  // Skipped entirely when the user has no preference — treated as neutral,
  // not a penalty. Slugs are expanded to DB-cased variants (P0 #6) so a
  // profile saying "full-time" matches jobs stored as "Full-time",
  // "FULL_TIME", "Full Time", etc.
  if (profile.desiredEmploymentTypes.length > 0) {
    const variants = resolveEmploymentVariants(profile.desiredEmploymentTypes);
    if (variants.length > 0) {
      parts.push(
        Prisma.sql`CASE WHEN j."employmentType" = ANY(${variants}) THEN ${EMPLOYMENT_TYPE_BOOST} ELSE 0 END`
      );
    }
  }

  // -- 6. Skills ts_rank (P0 #2). Biggest precision win — uses the existing
  //       Job.searchVector tsvector + a tsquery built from the user's skill
  //       names. Scaled by SKILLS_RANK_MULT and capped via LEAST() so a
  //       trove of niche keyword hits can't out-rank stronger signals.
  //
  //       The `WHEN @@ ELSE 0` guard short-circuits the per-row ts_rank
  //       call for jobs whose searchVector doesn't match the tsquery at
  //       all. @@ evaluation against the GIN-indexed tsvector is cheap;
  //       ts_rank is not. On a 60-80k post-filter row set this saves
  //       roughly an order of magnitude of computation per page-1 sort. --
  if (profile.skillNames && profile.skillNames.length > 0) {
    const tsquery = buildSkillsTsquery(profile.skillNames);
    if (tsquery) {
      parts.push(
        Prisma.sql`CASE WHEN j."searchVector" @@ to_tsquery('english', ${tsquery}) THEN LEAST(${SKILLS_BOOST_CAP}, ts_rank(j."searchVector", to_tsquery('english', ${tsquery})) * ${SKILLS_RANK_MULT}) ELSE 0 END`
      );
    }
  }

  // -- 7. Recency boost (up to 15 pts) --
  parts.push(RECENCY_BOOST);

  return parts;
}

/**
 * Penalty expression (P0 #1 + #3). Returns a Prisma.Sql fragment that
 * evaluates to a non-negative integer subtracted from the final score via
 * GREATEST(0, raw - penalty). Empty if neither penalty applies (caller
 * should skip the subtraction).
 *
 * Two penalty sources:
 *   - Required-language gate: -40 when the job has any requiredLanguages
 *     entries AND the user's spokenLanguages does not overlap.
 *   - Level distance: -5 for one step off, -15 for two or more steps off,
 *     between the user's yearsExperience-derived level and the job's
 *     experienceLevel slug. Skipped when either side is null/unknown.
 */
function buildPenaltyExpr(profile: RelevanceProfile): Prisma.Sql | null {
  const terms: Prisma.Sql[] = [];

  // Language penalty: only fires when the job specifies required languages
  // AND none of them overlap with what the user speaks. Empty-on-both-sides
  // is neutral (no penalty).
  const userLangs = profile.spokenLanguages ?? [];
  // Always emit the SQL when the user has any spoken language data OR none —
  // the per-job check is `requiredLanguages` non-empty AND no overlap. Pass
  // an empty array when the user has nothing so missing-language gates fire.
  terms.push(
    Prisma.sql`CASE WHEN cardinality(j."requiredLanguages") > 0 AND NOT (j."requiredLanguages" && ${userLangs}::text[]) THEN ${LANGUAGE_MISSING_PENALTY} ELSE 0 END`
  );

  // Level distance penalty.
  if (profile.yearsExperience !== undefined && profile.yearsExperience !== null) {
    const userLevel = yearsToLevel(profile.yearsExperience);
    const userIdx = LEVEL_ORDER.indexOf(userLevel);
    // Postgres-side: lookup the job's level index and compute distance. We
    // materialize LEVEL_ORDER as a literal array so the per-row evaluation
    // is a small int-index lookup; null/unknown slugs map to NULL → no
    // penalty (CASE...WHEN NULL never matches the > branches).
    const levels: string[] = [...LEVEL_ORDER];
    terms.push(
      Prisma.sql`
        CASE
          WHEN j."experienceLevel" IS NULL THEN 0
          WHEN array_position(${levels}::text[], j."experienceLevel") IS NULL THEN 0
          WHEN ABS(array_position(${levels}::text[], j."experienceLevel") - ${userIdx + 1}) = 0 THEN 0
          WHEN ABS(array_position(${levels}::text[], j."experienceLevel") - ${userIdx + 1}) = 1 THEN ${LEVEL_DISTANCE_PENALTY_1}
          ELSE ${LEVEL_DISTANCE_PENALTY_2PLUS}
        END
      `
    );
  }

  if (terms.length === 0) return null;
  return Prisma.sql`(${Prisma.join(terms, " + ")})`;
}

/**
 * True when the profile has at least one signal that drives ranking.
 *
 * Note: only structural signals count here — `currentTitle`/`fieldOfStudy`
 * were removed because their per-row `ts_rank` evaluation was the dominant
 * cost on `sort=relevance`. They remain on `RelevanceProfile` because the
 * Prisma query selects them; they are simply ignored by scoring.
 */
export function hasProfileSignals(profile: RelevanceProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.locationCity ||
    profile.locationState ||
    profile.openToRemote ||
    profile.openToHybrid ||
    profile.openToOnsite ||
    profile.desiredSalaryMin != null ||
    profile.desiredSalaryMax != null ||
    profile.targetRoles.length > 0 ||
    profile.desiredEmploymentTypes.length > 0 ||
    (profile.skillNames && profile.skillNames.length > 0) ||
    (profile.yearsExperience !== undefined && profile.yearsExperience !== null)
  );
}

/**
 * Wrap a positive-score expression with the language/level penalty subtract
 * and a non-negative floor. Centralised so buildRelevanceOrder and
 * buildRelevanceScoreSql apply identical math.
 */
function withPenaltyAndFloor(
  scoreExpr: Prisma.Sql,
  profile: RelevanceProfile
): Prisma.Sql {
  const penalty = buildPenaltyExpr(profile);
  if (!penalty) return Prisma.sql`GREATEST(0, ${scoreExpr})`;
  return Prisma.sql`GREATEST(0, (${scoreExpr}) - ${penalty})`;
}

/**
 * Build a raw SQL ORDER BY clause for job relevance based on user profile.
 *
 * When the profile has scoring signals the result looks like:
 *   `GREATEST(0, (score_expr) - penalty_expr) DESC, j."createdAt" DESC NULLS LAST`
 *
 * When the profile is empty (all null/false) it falls back to:
 *   `j."createdAt" DESC NULLS LAST`
 *
 * The caller uses this directly after ORDER BY in a raw query where
 * the Job table is aliased as `j`.
 */
export function buildRelevanceOrder(profile: RelevanceProfile): Prisma.Sql {
  if (!hasProfileSignals(profile)) {
    return RECENCY_FALLBACK;
  }

  const parts = buildProfileScoreParts(profile);
  const scoreExpr = Prisma.join(parts, " + ");
  const wrapped = withPenaltyAndFloor(scoreExpr, profile);

  return Prisma.sql`${wrapped} DESC, j."createdAt" DESC NULLS LAST`;
}

/**
 * Build the raw SQL score expression usable in SELECT (not just ORDER BY).
 *
 * Returns a Prisma.Sql fragment that evaluates to the per-job raw score
 * (same expression powering buildRelevanceOrder). The route uses this to
 * select `score` alongside the row IDs so it can attach a normalized
 * matchScore (0–100) to each result.
 *
 * Falls back to literal `0` when the profile has no scoring signals —
 * matches buildRelevanceOrder's recency-fallback behavior (the caller is
 * expected to skip the SELECT entirely in that case, but emitting a
 * constant keeps the function total).
 */
export function buildRelevanceScoreSql(profile: RelevanceProfile): Prisma.Sql {
  if (!hasProfileSignals(profile)) {
    return Prisma.sql`0`;
  }
  const parts = buildProfileScoreParts(profile);
  const scoreExpr = Prisma.join(parts, " + ");
  return withPenaltyAndFloor(scoreExpr, profile);
}

/**
 * Compute the maximum possible raw score for a given profile. Used by the
 * API to normalize per-row scores into a 0–100 integer.
 *
 * Only signals the profile actually has are summed — a profile with no
 * salary range doesn't reserve the salary slots, so a job that matches
 * everything else still tops out at 100. Returns 0 when no signals are
 * present (caller treats this as "no score available" and returns
 * matchScore = undefined).
 *
 * Mutually-exclusive notes:
 *   - openToRemote/openToHybrid/openToOnsite all gate the same CASE; only
 *     one branch can fire per row. We add the largest weight whose flag is
 *     on (Remote=20 ≥ Hybrid=15 ≥ Onsite=10).
 *
 * Penalties (language -40, level -15) intentionally do NOT add to the
 * ceiling; they apply via GREATEST(0, raw - penalty), so they can drop a
 * score below the visibility cutoff but never inflate the denominator.
 */
export function computeMaxRawScore(profile: RelevanceProfile): number {
  let max = 0;
  if (profile.locationCity) max += SIGNAL_MAX.city;
  if (profile.locationState) max += SIGNAL_MAX.state;
  if (profile.openToRemote || profile.openToHybrid || profile.openToOnsite) {
    // Take the largest of the three — any single job only fires one branch.
    const weights: number[] = [];
    if (profile.openToRemote) weights.push(WORK_MODE_REMOTE_BOOST);
    if (profile.openToHybrid) weights.push(WORK_MODE_HYBRID_BOOST);
    if (profile.openToOnsite) weights.push(WORK_MODE_ONSITE_BOOST);
    max += Math.max(...weights);
  }
  if (profile.desiredSalaryMin !== null) max += SIGNAL_MAX.salaryMin;
  if (profile.desiredSalaryMax !== null) max += SIGNAL_MAX.salaryMax;
  if (profile.targetRoles.length > 0) max += SIGNAL_MAX.targetRoles;
  if (profile.desiredEmploymentTypes.length > 0) max += SIGNAL_MAX.employmentType;
  if (profile.skillNames && profile.skillNames.length > 0) {
    max += SIGNAL_MAX.skills;
  }
  // Recency boost is always in the expression — see buildProfileScoreParts.
  max += SIGNAL_MAX.recency;
  return max;
}

/**
 * Build a blended ORDER BY that combines FTS text rank with profile relevance.
 * Used when the user has both a text query and sort=relevance.
 *
 * The text component is weighted at 30x ts_rank, and all profile-based signals
 * are added on top of that.
 *
 * @param query   - The user's search text (for ts_rank)
 * @param profile - The user's profile data
 */
export function buildBlendedRelevanceOrder(
  query: string,
  profile: RelevanceProfile
): Prisma.Sql {
  // Text relevance component: ts_rank * 30
  const textRank = Prisma.sql`ts_rank(j."searchVector", plainto_tsquery('english', ${query})) * 30`;

  const profileParts = buildProfileScoreParts(profile);
  const allParts = [textRank, ...profileParts];
  const scoreExpr = Prisma.join(allParts, " + ");
  const wrapped = withPenaltyAndFloor(scoreExpr, profile);

  return Prisma.sql`${wrapped} DESC, j."createdAt" DESC NULLS LAST`;
}
