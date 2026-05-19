import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobsQuerySchema, datePostedToCutoff } from "@/lib/validations/jobs";
import { EXPERIENCE_LEVEL_OPTIONS } from "@/lib/experience-level";
import { buildFacets } from "@/lib/job-facets";
import {
  usEligibleWhere,
  usEligibleSqlCondition,
  fullTimeOnlyWhere,
  fullTimeOnlySqlCondition,
} from "@/lib/jobs/eligibility-filter";
import {
  buildRelevanceOrder,
  buildBlendedRelevanceOrder,
  buildRelevanceScoreSql,
  computeMaxRawScore,
  hasProfileSignals,
} from "@/lib/job-relevance";
import type { RelevanceProfile } from "@/lib/job-relevance";
import type { ApiResponse, JobWithCompany } from "@/types";

// 7-day window for the rolling applicationVelocity count. Detail-pane only,
// signed-in only — see the per-row enrichment block below for the gating.
const VELOCITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Cap on the IN list size for the multi-select `companies` filter. 20 is more
// than any reasonable user will pick by hand; protects against accidental
// runaway requests if the URL is constructed programmatically.
const MAX_COMPANIES_FILTER = 20;

// Cap on the IN list size for the multi-select `levels` filter. The enum
// only has 5 values today; bound at 10 anyway to guard against malformed
// requests echoing the user's input back at us.
const MAX_LEVELS_FILTER = 10;

/**
 * Parse the `companies` (plural, canonical) or `company` (legacy singular)
 * query params.
 *
 * Returns:
 *   - `{ exactNames: [...] }` when `companies` is set — names matched
 *     verbatim via WHERE Company.name IN (...). Empty list → no filter.
 *   - `{ legacySubstring }` when `companies` is absent but legacy `company`
 *     is present — substring LIKE on Company.name (back-compat semantics).
 *   - `{}` when neither is set.
 */
function parseCompanyFilters(params: {
  companies?: string;
  company?: string;
}): { exactNames?: string[]; legacySubstring?: string } {
  if (params.companies) {
    const list = params.companies
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const deduped = Array.from(new Set(list)).slice(0, MAX_COMPANIES_FILTER);
    return { exactNames: deduped };
  }
  if (params.company) {
    return { legacySubstring: params.company };
  }
  return {};
}

/**
 * Build the Prisma-style where filter for the company column. Mirrors
 * parseCompanyFilters: exact `IN` for the new canonical param, substring
 * `LIKE` for the legacy single-value param.
 */
function buildCompanyWhere(
  parsed: ReturnType<typeof parseCompanyFilters>,
): Prisma.JobWhereInput {
  if (parsed.exactNames && parsed.exactNames.length > 0) {
    return { company: { name: { in: parsed.exactNames } } };
  }
  if (parsed.legacySubstring) {
    return {
      company: {
        name: { contains: parsed.legacySubstring, mode: "insensitive" as const },
      },
    };
  }
  return {};
}

/**
 * Parse the `levels` (canonical, multi-select) or `experienceLevel` (legacy
 * singular) query params into the canonical experience-level slug list.
 * Empty result = no filter.
 *
 * - `levels` wins when set; `experienceLevel` is back-compat only.
 * - Slugs are deduped, trimmed, lowercased, and validated against
 *   EXPERIENCE_LEVEL_OPTIONS — unknown values are silently dropped so a
 *   stale URL with a renamed slug doesn't 400.
 */
function parseLevelFilters(params: {
  levels?: string;
  experienceLevel?: string;
}): string[] {
  const known = new Set<string>(EXPERIENCE_LEVEL_OPTIONS);
  if (params.levels) {
    const list = params.levels
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && known.has(s));
    return Array.from(new Set(list)).slice(0, MAX_LEVELS_FILTER);
  }
  if (params.experienceLevel && known.has(params.experienceLevel)) {
    return [params.experienceLevel];
  }
  return [];
}

/**
 * Build the Prisma-style where filter for the experienceLevel column.
 * Empty list = no filter. Single entry uses `=`; multi uses `IN (...)`.
 */
function buildLevelsWhere(levels: string[]): Prisma.JobWhereInput {
  if (levels.length === 0) return {};
  if (levels.length === 1) return { experienceLevel: levels[0] };
  return { experienceLevel: { in: levels } };
}

/**
 * Build the raw-SQL sub-select for the experienceLevel column. Mirrors
 * buildLevelsWhere for the raw-SQL paths. Returns null when no filter set.
 */
function buildLevelsSqlCondition(levels: string[]): Prisma.Sql | null {
  if (levels.length === 0) return null;
  if (levels.length === 1) return Prisma.sql`j."experienceLevel" = ${levels[0]}`;
  return Prisma.sql`j."experienceLevel" IN (${Prisma.join(levels)})`;
}

/**
 * Build the raw-SQL sub-select for the company filter. Mirrors
 * buildCompanyWhere for the routes that fall into the raw SQL path
 * (FTS, relevance, saved+recently_saved). Returns null when no filter is set.
 */
function buildCompanySqlCondition(
  parsed: ReturnType<typeof parseCompanyFilters>,
): Prisma.Sql | null {
  if (parsed.exactNames && parsed.exactNames.length > 0) {
    return Prisma.sql`j."companyId" IN (SELECT id FROM "Company" WHERE name IN (${Prisma.join(parsed.exactNames)}))`;
  }
  if (parsed.legacySubstring) {
    return Prisma.sql`j."companyId" IN (SELECT id FROM "Company" WHERE LOWER(name) LIKE LOWER(${"%" + parsed.legacySubstring + "%"}))`;
  }
  return null;
}

interface EnrichmentContext {
  userId: string | null;
  relevanceProfile: RelevanceProfile | null;
}

/**
 * Attach derived per-row fields (matchScore, applicationVelocity) to a page
 * of jobs. Single Prisma+raw round-trip rather than N per-row queries.
 *
 * Behavior matrix:
 *   - signed-out OR no profile signals → matchScore = undefined on every row
 *     (renderer hides the slot rather than showing a zero).
 *   - signed-in (regardless of profile) → applicationVelocity is computed.
 *     The number is also useful on the list, but Phase 1's UI consumer
 *     (detail pane only) gates the display; returning it on every row
 *     costs one extra grouped query and avoids a follow-up request when
 *     opening the pane.
 *
 * Returns a new array with the same row order — never mutates the input.
 */
async function enrichJobs(
  jobs: JobWithCompany[],
  ctx: EnrichmentContext,
): Promise<JobWithCompany[]> {
  if (jobs.length === 0) return jobs;

  const ids = jobs.map((j) => j.id);

  // Match score — normalize raw score → 0..100. Skip the SQL roundtrip
  // unless we actually have a profile with scoring signals; otherwise
  // every row gets matchScore = undefined and the slot stays hidden.
  let scoreById = new Map<string, number>();
  let maxRawScore = 0;
  if (ctx.relevanceProfile && hasProfileSignals(ctx.relevanceProfile)) {
    maxRawScore = computeMaxRawScore(ctx.relevanceProfile);
    if (maxRawScore > 0) {
      const scoreExpr = buildRelevanceScoreSql(ctx.relevanceProfile);
      const rows = await db.$queryRaw<Array<{ id: string; score: number }>>`
        SELECT j.id, ${scoreExpr}::float AS score
        FROM "Job" j
        WHERE j.id IN (${Prisma.join(ids)})
      `;
      scoreById = new Map(rows.map((r) => [r.id, Number(r.score)]));
    }
  }

  // Velocity — 7-day rolling applications count per job. Single grouped
  // query rather than a filtered _count include (avoids the Prisma preview
  // feature requirement and keeps the existing _count: { applications }
  // include — which is unfiltered all-time count — untouched).
  let velocityById = new Map<string, number>();
  if (ctx.userId) {
    const cutoff = new Date(Date.now() - VELOCITY_WINDOW_MS);
    const rows = await db.application.groupBy({
      by: ["jobId"],
      where: { jobId: { in: ids }, appliedAt: { gte: cutoff } },
      _count: { _all: true },
    });
    velocityById = new Map(rows.map((r) => [r.jobId, r._count._all]));
  }

  return jobs.map((job) => {
    const raw = scoreById.get(job.id);
    const matchScore =
      raw !== undefined && maxRawScore > 0
        ? Math.max(0, Math.min(100, Math.round((raw / maxRawScore) * 100)))
        : undefined;
    const applicationVelocity = ctx.userId
      ? velocityById.get(job.id) ?? 0
      : undefined;
    return { ...job, matchScore, applicationVelocity };
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = jobsQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid filter parameters" },
      { status: 400 }
    );
  }

  const {
    query,
    location,
    locationCity,
    locationState,
    department,
    company,    // legacy single-value, kept for back-compat — see parseCompanyFilters
    companies,  // canonical multi-select, comma-separated names
    experienceLevel,  // legacy single-value, kept for back-compat — see parseLevelFilters
    levels,           // canonical multi-select, comma-separated slugs
    workMode,
    datePosted,
    salaryMin,
    salaryMax,
    sort,
    provider,
    saved,
    page,
    limit,
  } = parsed.data;

  // Resolve `companies` (canonical) vs `company` (legacy) into a single
  // filter spec used by both the Prisma and raw-SQL paths.
  const companyFilter = parseCompanyFilters({ companies, company });
  const companyWhere = buildCompanyWhere(companyFilter);
  const companySqlCondition = buildCompanySqlCondition(companyFilter);

  // Resolve `levels` (canonical multi) vs `experienceLevel` (legacy single)
  // into the canonical slug list. Empty list = no filter.
  const levelFilters = parseLevelFilters({ levels, experienceLevel });
  const levelsWhere = buildLevelsWhere(levelFilters);
  const levelsSqlCondition = buildLevelsSqlCondition(levelFilters);

  // Note: legacy `?remote=true` URL param is parsed by the schema but
  // intentionally NOT applied as a filter. The `remote` toggle was removed
  // in favor of the 3-way workMode segment, and silently translating
  // `?remote=true` → `workMode=remote` was surprising users who landed on
  // those URLs from stale bookmarks expecting all jobs. If a user wants
  // remote-only, they click the Remote chip.

  const wantSaved = saved === "true";

  // V1 location matching strategy (documented):
  // When locationCity is provided, use it for LIKE matching (covers most ATS text like "Austin, TX").
  // When locationState is also provided, add a second LIKE for the state abbrev.
  // Legacy `location` param is used only when locationCity is absent.
  // Tradeoff: simple substring match; abbreviation normalization (NYC → New York) deferred to v2.
  const effectiveLocation = locationCity ?? location ?? undefined;
  const useStructuredLocation = !!locationCity;

  const skip = (page - 1) * limit;
  const isFirstPage = page === 1;
  const dateCutoff = datePostedToCutoff(datePosted);

  // Fetch user profile for relevance scoring + matchScore enrichment.
  //
  // Browse Jobs Phase 1: matchScore + applicationVelocity are emitted on every
  // page (including infinite-scroll page 2+), so the session + profile lookup
  // can no longer be gated on `isFirstPage && (relevance || FTS)`. The single
  // session decode is cheap (~5ms), and the profile fetch is gated on a real
  // userId — so signed-out infinite-scroll pays nothing extra.
  let relevanceProfile: RelevanceProfile | null = null;
  let userId: string | null = null;

  const session = await getServerSession(authOptions);
  userId = session?.user?.id ?? null;
  if (userId) {
    const profile = await db.userProfile.findUnique({
      where: { userId },
      select: {
        locationCity: true,
        locationState: true,
        openToRemote: true,
        openToOnsite: true,
        currentTitle: true,
        fieldOfStudy: true,
        desiredSalaryMin: true,
        desiredSalaryMax: true,
        targetRoles: true,
        desiredEmploymentTypes: true,
      },
    });
    if (profile) {
      relevanceProfile = profile;
    }
  }

  // Saved view requires authentication. An unauthenticated request to
  // ?saved=true short-circuits to an empty result rather than 401 — the UI
  // shows the same tabs (with the Saved tab grayed out) and gracefully
  // renders an empty list, which is friendlier than a hard auth error.
  if (wantSaved && !userId) {
    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: [],
      meta: { total: 0, page, limit },
    });
  }

  // Build location where clause: structured city takes priority over legacy location param
  const locationWhere: Prisma.JobWhereInput = useStructuredLocation
    ? {
        AND: [
          { location: { contains: locationCity, mode: "insensitive" as const } },
          ...(locationState
            ? [{ location: { contains: locationState, mode: "insensitive" as const } }]
            : []),
        ],
      }
    : effectiveLocation
    ? { location: { contains: effectiveLocation, mode: "insensitive" as const } }
    : {};

  // Structural where clause (shared by Prisma path and facets).
  // The US-eligibility filter is the platform's audience-curation gate; it
  // only runs against the listing API + facets — sitemap and detail pages
  // intentionally omit it so SEO + direct search-engine traffic stay intact.
  // employmentType is intentionally NOT spread in here. The Type filter
  // is removed from the UI; fullTimeOnlyWhere() is the only employmentType
  // gate. If a stale URL or external link includes ?type=..., it's ignored.
  const structuralWhere: Prisma.JobWhereInput = {
    isActive: true,
    ...usEligibleWhere(),
    ...fullTimeOnlyWhere(),
    ...(wantSaved && userId && { savedJobs: { some: { userId } } }),
    ...(provider && { provider }),
    // Legacy `remote: true` filter intentionally removed — workMode supersedes
    // it. Old `?remote=true` URLs are mapped to workMode="remote" above.
    ...(dateCutoff && { createdAt: { gte: dateCutoff } }),
    ...(salaryMin !== undefined && { salaryMin: { gte: salaryMin } }),
    ...(salaryMax !== undefined && { salaryMax: { lte: salaryMax } }),
    ...(effectiveLocation && locationWhere),
    ...(department && {
      department: { contains: department, mode: "insensitive" as const },
    }),
    ...companyWhere,
    // Slug-stored, slug-compared — multi-select via IN(...) when ≥2 picked.
    ...levelsWhere,
    ...(workMode && { workMode }),
  };

  // Dedicated path: Saved tab + "recently saved" sort. We need to order by
  // SavedJob.createdAt DESC, which Prisma can't express via orderBy on a
  // related table. Solved with a JOIN in raw SQL: efficient because the
  // SavedJob (userId, createdAt DESC) compound index makes this a no-cost
  // index scan even at scale.
  if (wantSaved && userId && sort === "recently_saved") {
    const savedConditions: Prisma.Sql[] = [
      Prisma.sql`sj."userId" = ${userId}`,
      Prisma.sql`j."isActive" = true`,
    ];
    const eligibility = usEligibleSqlCondition();
    if (eligibility) savedConditions.push(eligibility);
    const fullTime = fullTimeOnlySqlCondition();
    if (fullTime) savedConditions.push(fullTime);
    if (provider) savedConditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    // Legacy remote=true filter dropped — workMode covers it.
    // employmentType filter intentionally omitted — see structuralWhere comment.
    if (dateCutoff) savedConditions.push(Prisma.sql`j."createdAt" >= ${dateCutoff}`);
    if (salaryMin !== undefined) savedConditions.push(Prisma.sql`j."salaryMin" >= ${salaryMin}`);
    if (salaryMax !== undefined) savedConditions.push(Prisma.sql`j."salaryMax" <= ${salaryMax}`);
    if (useStructuredLocation && locationCity) {
      savedConditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationCity + "%"})`);
      if (locationState) {
        savedConditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationState + "%"})`);
      }
    } else if (effectiveLocation) {
      savedConditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + effectiveLocation + "%"})`);
    }
    if (department) savedConditions.push(Prisma.sql`LOWER(j."department") LIKE LOWER(${"%" + department + "%"})`);
    if (companySqlCondition) savedConditions.push(companySqlCondition);
    if (levelsSqlCondition) savedConditions.push(levelsSqlCondition);
    if (workMode) savedConditions.push(Prisma.sql`j."workMode" = ${workMode}`);
    if (query) {
      savedConditions.push(Prisma.sql`j."searchVector" @@ plainto_tsquery('english', ${query})`);
    }

    const savedWhereClause = Prisma.join(savedConditions, " AND ");

    const [rawIds, countRows, facetData] = await Promise.all([
      db.$queryRaw<Array<{ id: string }>>`
        SELECT j.id
        FROM "SavedJob" sj
        INNER JOIN "Job" j ON j.id = sj."jobId"
        WHERE ${savedWhereClause}
        ORDER BY sj."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "SavedJob" sj
        INNER JOIN "Job" j ON j.id = sj."jobId"
        WHERE ${savedWhereClause}
      `,
      isFirstPage ? buildFacets(structuralWhere) : Promise.resolve(null),
    ]);

    const ids = rawIds.map((r) => r.id);
    const total = Number(countRows[0]?.count ?? 0);

    const jobs =
      ids.length > 0
        ? await db.job.findMany({
            where: { id: { in: ids } },
            include: { company: true, _count: { select: { applications: true } } },
          })
        : [];

    // Re-order to match the recently-saved sort
    const idIndex = new Map(ids.map((id, i) => [id, i]));
    jobs.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

    const enriched = await enrichJobs(jobs as JobWithCompany[], {
      userId,
      relevanceProfile,
    });

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: enriched,
      meta: { total, page, limit, ...(facetData && { facets: facetData }) },
    });
  }

  // FTS path: use PostgreSQL tsvector/GIN for text queries
  if (query) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`j."isActive" = true`,
      Prisma.sql`j."searchVector" @@ plainto_tsquery('english', ${query})`,
    ];
    const eligibility = usEligibleSqlCondition();
    if (eligibility) conditions.push(eligibility);
    const fullTime = fullTimeOnlySqlCondition();
    if (fullTime) conditions.push(fullTime);
    if (wantSaved && userId) {
      conditions.push(
        Prisma.sql`j.id IN (SELECT "jobId" FROM "SavedJob" WHERE "userId" = ${userId})`,
      );
    }

    if (provider) conditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    // Legacy remote=true filter dropped — workMode covers it.
    // employmentType filter intentionally omitted — see structuralWhere comment.
    if (dateCutoff) conditions.push(Prisma.sql`j."createdAt" >= ${dateCutoff}`);
    if (salaryMin !== undefined) conditions.push(Prisma.sql`j."salaryMin" >= ${salaryMin}`);
    if (salaryMax !== undefined) conditions.push(Prisma.sql`j."salaryMax" <= ${salaryMax}`);
    if (useStructuredLocation && locationCity) {
      conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationCity + "%"})`);
      if (locationState) {
        conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationState + "%"})`);
      }
    } else if (effectiveLocation) {
      conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + effectiveLocation + "%"})`);
    }
    if (department) {
      conditions.push(Prisma.sql`LOWER(j."department") LIKE LOWER(${"%" + department + "%"})`);
    }
    if (companySqlCondition) conditions.push(companySqlCondition);
    if (levelsSqlCondition) conditions.push(levelsSqlCondition);
    if (workMode) conditions.push(Prisma.sql`j."workMode" = ${workMode}`);

    const whereClause = Prisma.join(conditions, " AND ");
    const orderClause =
      sort === "relevance" && relevanceProfile
        ? buildBlendedRelevanceOrder(query, relevanceProfile)
        : sort === "relevance"
        ? Prisma.sql`ts_rank(j."searchVector", plainto_tsquery('english', ${query})) DESC`
        : Prisma.sql`j."createdAt" DESC NULLS LAST`;

    const [rawIds, countRows, facets] = await Promise.all([
      db.$queryRaw<Array<{ id: string }>>`
        SELECT j.id
        FROM "Job" j
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ${limit} OFFSET ${skip}
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Job" j
        WHERE ${whereClause}
      `,
      // Facets use structuralWhere (no text query) intentionally: this shows
      // what filters are available across the structural context, not just the
      // current text-search subset. Standard pattern (similar to LinkedIn/Indeed).
      isFirstPage ? buildFacets(structuralWhere) : Promise.resolve(null),
    ]);

    const ids = rawIds.map((r) => r.id);
    const total = Number(countRows[0]?.count ?? 0);

    const jobs =
      ids.length > 0
        ? await db.job.findMany({
            where: { id: { in: ids } },
            include: {
              company: true,
              _count: { select: { applications: true } },
            },
          })
        : [];

    // Re-order to match FTS ranking (findMany does not preserve IN order)
    const idIndex = new Map(ids.map((id, i) => [id, i]));
    jobs.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

    const enriched = await enrichJobs(jobs as JobWithCompany[], {
      userId,
      relevanceProfile,
    });

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: enriched,
      meta: {
        total,
        page,
        limit,
        ...(facets && { facets }),
      },
    });
  }

  // Non-FTS relevance path: profile-based scoring via raw SQL.
  //
  // Two gating wins folded into one condition:
  //   1. Skip relevance entirely on page 2+ of infinite scroll. Pagination
  //      boundaries get a mild ranking discontinuity, but the latency win is
  //      large and aligns with how scroll users perceive ordering.
  //   2. Skip relevance when the profile lacks structural signals. The
  //      previous fallback inside `buildRelevanceOrder` already returned
  //      `createdAt DESC` in that case — falling through here is identical
  //      and avoids the extra raw-SQL roundtrip.
  if (
    sort === "relevance" &&
    isFirstPage &&
    relevanceProfile &&
    hasProfileSignals(relevanceProfile)
  ) {
    const relevanceOrder = buildRelevanceOrder(relevanceProfile);

    const conditions: Prisma.Sql[] = [Prisma.sql`j."isActive" = true`];
    const eligibility = usEligibleSqlCondition();
    if (eligibility) conditions.push(eligibility);
    const fullTime = fullTimeOnlySqlCondition();
    if (fullTime) conditions.push(fullTime);
    if (wantSaved && userId) {
      conditions.push(
        Prisma.sql`j.id IN (SELECT "jobId" FROM "SavedJob" WHERE "userId" = ${userId})`,
      );
    }
    if (provider) conditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    // Legacy remote=true filter dropped — workMode covers it.
    // employmentType filter intentionally omitted — see structuralWhere comment.
    if (dateCutoff) conditions.push(Prisma.sql`j."createdAt" >= ${dateCutoff}`);
    if (salaryMin !== undefined) conditions.push(Prisma.sql`j."salaryMin" >= ${salaryMin}`);
    if (salaryMax !== undefined) conditions.push(Prisma.sql`j."salaryMax" <= ${salaryMax}`);
    if (useStructuredLocation && locationCity) {
      conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationCity + "%"})`);
      if (locationState) {
        conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + locationState + "%"})`);
      }
    } else if (effectiveLocation) {
      conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + effectiveLocation + "%"})`);
    }
    if (department) {
      conditions.push(Prisma.sql`LOWER(j."department") LIKE LOWER(${"%" + department + "%"})`);
    }
    if (companySqlCondition) conditions.push(companySqlCondition);
    if (levelsSqlCondition) conditions.push(levelsSqlCondition);
    if (workMode) conditions.push(Prisma.sql`j."workMode" = ${workMode}`);

    const whereClause = Prisma.join(conditions, " AND ");

    const [rawIds, countRows, facetData] = await Promise.all([
      db.$queryRaw<Array<{ id: string }>>`
        SELECT j.id FROM "Job" j WHERE ${whereClause} ORDER BY ${relevanceOrder} LIMIT ${limit} OFFSET ${skip}
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "Job" j WHERE ${whereClause}
      `,
      isFirstPage ? buildFacets(structuralWhere) : Promise.resolve(null),
    ]);

    const ids = rawIds.map((r) => r.id);
    const total = Number(countRows[0]?.count ?? 0);
    const jobs =
      ids.length > 0
        ? await db.job.findMany({
            where: { id: { in: ids } },
            include: { company: true, _count: { select: { applications: true } } },
          })
        : [];

    // Preserve score order
    const idIndex = new Map(ids.map((id, i) => [id, i]));
    jobs.sort((a, b) => (idIndex.get(a.id) ?? 0) - (idIndex.get(b.id) ?? 0));

    const enriched = await enrichJobs(jobs as JobWithCompany[], {
      userId,
      relevanceProfile,
    });

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: enriched,
      meta: { total, page, limit, ...(facetData && { facets: facetData }) },
    });
  }

  // Non-FTS path: pure Prisma with composite indexes (newest sort or unauthenticated fallback)
  const [total, jobs, facets] = await Promise.all([
    db.job.count({ where: structuralWhere }),
    db.job.findMany({
      where: structuralWhere,
      include: {
        company: true,
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    isFirstPage ? buildFacets(structuralWhere) : Promise.resolve(null),
  ]);

  const enriched = await enrichJobs(jobs as JobWithCompany[], {
    userId,
    relevanceProfile,
  });

  return NextResponse.json<ApiResponse<JobWithCompany[]>>({
    success: true,
    data: enriched,
    meta: {
      total,
      page,
      limit,
      ...(facets && { facets }),
    },
  });
}
