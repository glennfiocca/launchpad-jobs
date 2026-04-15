import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../_helpers"
import { paginationSchema } from "@/lib/validations/admin"
import { z } from "zod"
import type { ApiResponse } from "@/types"
import type { AdminJob } from "@/types/admin"

const jobsQuerySchema = paginationSchema.extend({
  isActive: z.coerce.boolean().optional(),
  remote: z.coerce.boolean().optional(),
  companyId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = jobsQuerySchema.safeParse(params)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { page, limit, search, isActive, remote, companyId } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(remote !== undefined ? { remote } : {}),
    ...(companyId ? { companyId } : {}),
  }

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      select: {
        id: true,
        publicJobId: true,
        title: true,
        location: true,
        department: true,
        remote: true,
        isActive: true,
        postedAt: true,
        company: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { postedAt: "desc" },
      skip,
      take: limit,
    }),
    db.job.count({ where }),
  ])

  return NextResponse.json<ApiResponse<AdminJob[]>>({
    success: true,
    data: jobs as AdminJob[],
    meta: { total, page, limit },
  })
}
