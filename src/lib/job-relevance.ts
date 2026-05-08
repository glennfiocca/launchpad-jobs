import { Prisma } from "@prisma/client";

/** Profile fields relevant to relevance scoring -- fetched from UserProfile. */
export interface RelevanceProfile {
  locationCity: string | null;
  locationState: string | null;
  openToRemote: boolean;
  openToOnsite: boolean;
  currentTitle: string | null;
  fieldOfStudy: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  // Phase 5 additions (additive — empty arrays are treated as "no preference").
  targetRoles: string[];
  desiredEmploymentTypes: string[];
}

// Cap on cumulative `targetRoles` boost to prevent keyword-stuffing the title.
// 2 matching keywords saturate it; further matches are ignored.
const TARGET_ROLE_BOOST_PER_MATCH = 15;
const TARGET_ROLE_BOOST_CAP = 30;
const EMPLOYMENT_TYPE_BOOST = 10;

/** Fallback ORDER BY when no profile signals are available. */
const RECENCY_FALLBACK = Prisma.sql`j."createdAt" DESC NULLS LAST`;

/**
 * Recency boost: newer jobs get up to 15 bonus points, decaying 1 pt/day.
 * Jobs older than 15 days receive 0.
 */
const RECENCY_BOOST = Prisma.sql`GREATEST(0, 15 - EXTRACT(DAY FROM NOW() - j."createdAt"))`;

/** Assemble profile-based scoring fragments from a RelevanceProfile. */
function buildProfileScoreParts(profile: RelevanceProfile): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];

  // -- 1. Location match (city +25, state +10) --
  if (profile.locationCity) {
    const cityPattern = "%" + profile.locationCity + "%";
    parts.push(
      Prisma.sql`CASE WHEN LOWER(j."location") LIKE LOWER(${cityPattern}) THEN 25 ELSE 0 END`
    );
  }
  if (profile.locationState) {
    const statePattern = "%" + profile.locationState + "%";
    parts.push(
      Prisma.sql`CASE WHEN LOWER(j."location") LIKE LOWER(${statePattern}) THEN 10 ELSE 0 END`
    );
  }

  // -- 2. Remote / onsite preference --
  if (profile.openToRemote) {
    parts.push(
      Prisma.sql`CASE WHEN j."remote" = true THEN 20 ELSE 0 END`
    );
  }
  if (profile.openToOnsite) {
    parts.push(
      Prisma.sql`CASE WHEN j."remote" = false THEN 10 ELSE 0 END`
    );
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
  // For each keyword, +15 if it appears as a case-insensitive substring of
  // j."title". Sum across keywords is capped via LEAST(..., 30) so a profile
  // listing 5 overlapping keywords doesn't dominate the score.
  if (profile.targetRoles.length > 0) {
    const perKeywordParts: Prisma.Sql[] = profile.targetRoles.map((kw) => {
      const pattern = "%" + kw + "%";
      return Prisma.sql`CASE WHEN LOWER(j."title") LIKE LOWER(${pattern}) THEN ${TARGET_ROLE_BOOST_PER_MATCH} ELSE 0 END`;
    });
    const sumExpr = Prisma.join(perKeywordParts, " + ");
    parts.push(Prisma.sql`LEAST(${TARGET_ROLE_BOOST_CAP}, ${sumExpr})`);
  }

  // -- 5. Employment-type preference (+10 if match, otherwise 0) --
  // Skipped entirely when the user has no preference — treated as neutral,
  // not a penalty.
  if (profile.desiredEmploymentTypes.length > 0) {
    parts.push(
      Prisma.sql`CASE WHEN j."employmentType" = ANY(${profile.desiredEmploymentTypes}) THEN ${EMPLOYMENT_TYPE_BOOST} ELSE 0 END`
    );
  }

  // -- 6. Recency boost (up to 15 pts) --
  parts.push(RECENCY_BOOST);

  return parts;
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
    profile.openToOnsite ||
    profile.desiredSalaryMin != null ||
    profile.desiredSalaryMax != null ||
    profile.targetRoles.length > 0 ||
    profile.desiredEmploymentTypes.length > 0
  );
}

/**
 * Build a raw SQL ORDER BY clause for job relevance based on user profile.
 *
 * When the profile has scoring signals the result looks like:
 *   `(score_expr) DESC, j."createdAt" DESC NULLS LAST`
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

  return Prisma.sql`(${scoreExpr}) DESC, j."createdAt" DESC NULLS LAST`;
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

  return Prisma.sql`(${scoreExpr}) DESC, j."createdAt" DESC NULLS LAST`;
}
