import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jobsQuerySchema, datePostedToCutoff } from "@/lib/validations/jobs";
import { buildFacets } from "@/lib/job-facets";
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
    department,
    company,
    remote,
    employmentType,
    datePosted,
    salaryMin,
    salaryMax,
    sort,
    page,
    limit,
  } = parsed.data;

  const skip = (page - 1) * limit;
  const isFirstPage = page === 1;
  const dateCutoff = datePostedToCutoff(datePosted);

  // Structural where clause (shared by Prisma path and facets)
  const structuralWhere: Prisma.JobWhereInput = {
    isActive: true,
    ...(remote === "true" && { remote: true }),
    ...(employmentType && { employmentType }),
    ...(dateCutoff && { postedAt: { gte: dateCutoff } }),
    ...(salaryMin !== undefined && { salaryMin: { gte: salaryMin } }),
    ...(salaryMax !== undefined && { salaryMax: { lte: salaryMax } }),
    ...(location && {
      location: { contains: location, mode: "insensitive" as const },
    }),
    ...(department && {
      department: { contains: department, mode: "insensitive" as const },
    }),
    ...(company && {
      company: { name: { contains: company, mode: "insensitive" as const } },
    }),
  };

  // FTS path: use PostgreSQL tsvector/GIN for text queries
  if (query) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`j."isActive" = true`,
      Prisma.sql`j."searchVector" @@ plainto_tsquery('english', ${query})`,
    ];

    if (remote === "true") conditions.push(Prisma.sql`j."remote" = true`);
    if (employmentType) conditions.push(Prisma.sql`j."employmentType" = ${employmentType}`);
    if (dateCutoff) conditions.push(Prisma.sql`j."postedAt" >= ${dateCutoff}`);
    if (salaryMin !== undefined) conditions.push(Prisma.sql`j."salaryMin" >= ${salaryMin}`);
    if (salaryMax !== undefined) conditions.push(Prisma.sql`j."salaryMax" <= ${salaryMax}`);
    if (location) {
      conditions.push(Prisma.sql`LOWER(j."location") LIKE LOWER(${"%" + location + "%"})`);
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
      sort === "relevance"
        ? Prisma.sql`ts_rank(j."searchVector", plainto_tsquery('english', ${query})) DESC`
        : Prisma.sql`j."postedAt" DESC NULLS LAST`;

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

  // Non-FTS path: pure Prisma with composite indexes
  const [total, jobs, facets] = await Promise.all([
    db.job.count({ where: structuralWhere }),
    db.job.findMany({
      where: structuralWhere,
      include: {
        company: true,
        _count: { select: { applications: true } },
      },
      orderBy: { postedAt: "desc" },
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
