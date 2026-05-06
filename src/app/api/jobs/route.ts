import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobsQuerySchema, datePostedToCutoff } from "@/lib/validations/jobs";
import { resolveEmploymentTypeFilter } from "@/lib/employment-type";
import { buildFacets } from "@/lib/job-facets";
import { usEligibleWhere, usEligibleSqlCondition } from "@/lib/jobs/eligibility-filter";
import {
  buildRelevanceOrder,
  buildBlendedRelevanceOrder,
  hasProfileSignals,
} from "@/lib/job-relevance";
import type { RelevanceProfile } from "@/lib/job-relevance";
import type { ApiResponse, JobWithCompany } from "@/types";

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
    company,
    remote,
    employmentType,
    datePosted,
    salaryMin,
    salaryMax,
    sort,
    provider,
    saved,
    page,
    limit,
  } = parsed.data;

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

  // Fetch user profile for relevance scoring.
  //
  // Gated on (sort === "relevance" || hasFtsQuery) && page === 1:
  //   - Page 2+ of non-FTS relevance falls back to "newest" anyway (see Path B
  //     short-circuit below), so profile signals are unused.
  //   - Page 2+ of FTS+relevance falls back to plain ts_rank DESC (text-only),
  //     matching the unauthenticated branch already in that path.
  //   - "newest" sort never needs the profile.
  // This skips a UserProfile lookup on every infinite-scroll page-2+ hit.
  let relevanceProfile: RelevanceProfile | null = null;
  let userId: string | null = null;
  const hasFtsQuery = !!query;
  const profileFetchNeeded =
    isFirstPage && (sort === "relevance" || hasFtsQuery);
  // Saved-view also needs the session — to filter to the user's SavedJob rows.
  if (profileFetchNeeded || wantSaved) {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id ?? null;

    if (userId && profileFetchNeeded) {
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
        },
      });
      if (profile) {
        relevanceProfile = profile;
      }
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
  const structuralWhere: Prisma.JobWhereInput = {
    isActive: true,
    ...usEligibleWhere(),
    ...(wantSaved && userId && { savedJobs: { some: { userId } } }),
    ...(provider && { provider }),
    ...(remote === "true" && { remote: true }),
    ...(employmentType && { employmentType: { in: resolveEmploymentTypeFilter(employmentType) ?? [employmentType] } }),
    ...(dateCutoff && { createdAt: { gte: dateCutoff } }),
    ...(salaryMin !== undefined && { salaryMin: { gte: salaryMin } }),
    ...(salaryMax !== undefined && { salaryMax: { lte: salaryMax } }),
    ...(effectiveLocation && locationWhere),
    ...(department && {
      department: { contains: department, mode: "insensitive" as const },
    }),
    ...(company && {
      company: { name: { contains: company, mode: "insensitive" as const } },
    }),
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
    if (provider) savedConditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    if (remote === "true") savedConditions.push(Prisma.sql`j."remote" = true`);
    if (employmentType) {
      const variants = resolveEmploymentTypeFilter(employmentType) ?? [employmentType];
      savedConditions.push(Prisma.sql`j."employmentType" = ANY(${variants})`);
    }
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
    if (company) {
      savedConditions.push(
        Prisma.sql`j."companyId" IN (SELECT id FROM "Company" WHERE LOWER(name) LIKE LOWER(${"%" + company + "%"}))`,
      );
    }
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

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: jobs as JobWithCompany[],
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
    if (wantSaved && userId) {
      conditions.push(
        Prisma.sql`j.id IN (SELECT "jobId" FROM "SavedJob" WHERE "userId" = ${userId})`,
      );
    }

    if (provider) conditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    if (remote === "true") conditions.push(Prisma.sql`j."remote" = true`);
    if (employmentType) {
      const variants = resolveEmploymentTypeFilter(employmentType) ?? [employmentType];
      conditions.push(Prisma.sql`j."employmentType" = ANY(${variants})`);
    }
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
    if (company) {
      conditions.push(
        Prisma.sql`j."companyId" IN (SELECT id FROM "Company" WHERE LOWER(name) LIKE LOWER(${"%" + company + "%"}))`
      );
    }

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

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: jobs as JobWithCompany[],
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
    if (wantSaved && userId) {
      conditions.push(
        Prisma.sql`j.id IN (SELECT "jobId" FROM "SavedJob" WHERE "userId" = ${userId})`,
      );
    }
    if (provider) conditions.push(Prisma.sql`j."provider" = ${provider}::"AtsProvider"`);
    if (remote === "true") conditions.push(Prisma.sql`j."remote" = true`);
    if (employmentType) {
      const variants = resolveEmploymentTypeFilter(employmentType) ?? [employmentType];
      conditions.push(Prisma.sql`j."employmentType" = ANY(${variants})`);
    }
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
    if (company) {
      conditions.push(
        Prisma.sql`j."companyId" IN (SELECT id FROM "Company" WHERE LOWER(name) LIKE LOWER(${"%" + company + "%"}))`
      );
    }

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

    return NextResponse.json<ApiResponse<JobWithCompany[]>>({
      success: true,
      data: jobs as JobWithCompany[],
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

  return NextResponse.json<ApiResponse<JobWithCompany[]>>({
    success: true,
    data: jobs as JobWithCompany[],
    meta: {
      total,
      page,
      limit,
      ...(facets && { facets }),
    },
  });
}
