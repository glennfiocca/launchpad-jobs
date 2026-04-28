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
}

/** Fallback ORDER BY when no profile signals are available. */
const RECENCY_FALLBACK = Prisma.sql`j."postedAt" DESC NULLS LAST`;

/**
 * Recency boost: newer jobs get up to 15 bonus points, decaying 1 pt/day.
 * Jobs older than 15 days receive 0.
 */
const RECENCY_BOOST = Prisma.sql`GREATEST(0, 15 - EXTRACT(DAY FROM NOW() - COALESCE(j."postedAt", '1970-01-01'::timestamptz)))`;

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

  // -- 3. Professional identity match (ts_rank * 40) --
  const identityParts = [profile.currentTitle, profile.fieldOfStudy]
    .filter((s): s is string => !!s && s.trim().length > 0);
  if (identityParts.length > 0) {
    const profileText = identityParts.join(" ");
    parts.push(
      Prisma.sql`ts_rank(j."searchVector", plainto_tsquery('english', ${profileText})) * 40`
    );
  }

  // -- 4. Salary overlap (up to 20 pts: 10 per bound) --
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

  // -- 5. Recency boost (up to 15 pts) --
  parts.push(RECENCY_BOOST);

  return parts;
}

/** True when the profile has at least one non-null / non-default signal. */
function hasProfileSignals(profile: RelevanceProfile): boolean {
  return (
    !!profile.locationCity ||
    !!profile.locationState ||
    profile.openToRemote ||
    profile.openToOnsite ||
    !!profile.currentTitle ||
    !!profile.fieldOfStudy ||
    profile.desiredSalaryMin !== null ||
    profile.desiredSalaryMax !== null
  );
}

/**
 * Build a raw SQL ORDER BY clause for job relevance based on user profile.
 *
 * When the profile has scoring signals the result looks like:
 *   `(score_expr) DESC, j."postedAt" DESC NULLS LAST`
 *
 * When the profile is empty (all null/false) it falls back to:
 *   `j."postedAt" DESC NULLS LAST`
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

  return Prisma.sql`(${scoreExpr}) DESC, j."postedAt" DESC NULLS LAST`;
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

  return Prisma.sql`(${scoreExpr}) DESC, j."postedAt" DESC NULLS LAST`;
}
