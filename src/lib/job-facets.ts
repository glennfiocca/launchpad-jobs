import { db } from "@/lib/db";
import type { JobFacets } from "@/types";
import type { Prisma } from "@prisma/client";

export async function buildFacets(
  where: Prisma.JobWhereInput
): Promise<JobFacets> {
  const [departments, employmentTypes, companies, remoteCount, salaryAgg] =
    await Promise.all([
      db.job.groupBy({
        by: ["department"],
        where: { ...where, department: { not: null } },
        _count: { department: true },
        orderBy: { _count: { department: "desc" } },
        take: 20,
      }),

      db.job.groupBy({
        by: ["employmentType"],
        where: { ...where, employmentType: { not: null } },
        _count: { employmentType: true },
        orderBy: { _count: { employmentType: "desc" } },
      }),

      db.job.groupBy({
        by: ["companyId"],
        where,
        _count: { companyId: true },
        orderBy: { _count: { companyId: "desc" } },
        take: 20,
      }),

      db.job.count({ where: { ...where, remote: true } }),

      db.job.aggregate({
        where: { ...where, salaryMin: { not: null } },
        _min: { salaryMin: true },
        _max: { salaryMax: true },
      }),
    ]);

  // Resolve company names
  const companyIds = companies
    .map((c) => c.companyId)
    .filter((id): id is string => !!id);

  const companyRecords = companyIds.length
    ? await db.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true },
      })
    : [];

  const companyMap = new Map(companyRecords.map((c) => [c.id, c.name]));

  return {
    departments: departments
      .filter((d) => d.department)
      .map((d) => ({
        value: d.department!,
        count: d._count.department,
      })),
    employmentTypes: employmentTypes
      .filter((e) => e.employmentType)
      .map((e) => ({
        value: e.employmentType!,
        count: e._count.employmentType,
      })),
    companies: companies
      .filter((c) => c.companyId && companyMap.has(c.companyId))
      .map((c) => ({
        id: c.companyId!,
        name: companyMap.get(c.companyId!)!,
        count: c._count.companyId,
      })),
    totalRemote: remoteCount,
    salaryRange: {
      min: salaryAgg._min.salaryMin ?? null,
      max: salaryAgg._max.salaryMax ?? null,
    },
  };
}
