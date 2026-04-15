import { db } from "@/lib/db";

const jobInclude = {
  company: true,
  _count: { select: { applications: true } },
} as const;

/** Resolve route param as internal CUID or external `publicJobId` (e.g. PL…). */
export async function findJobByRouteId(param: string) {
  const p = param.trim();
  if (!p) return null;
  return db.job.findFirst({
    where: {
      OR: [{ id: p }, { publicJobId: { equals: p, mode: "insensitive" as const } }],
    },
    include: jobInclude,
  });
}
