import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../_helpers"
import { applicationsQuerySchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"
import type { AdminApplication, DispatchStatus } from "@/types/admin"

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = applicationsQuerySchema.safeParse(params)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { page, limit, search, status, dispatchStatus, companyId, userId, sortBy, sortDir, dateFrom, dateTo } =
    parsed.data
  const skip = (page - 1) * limit

  const where: Prisma.ApplicationWhereInput = {
    ...(status ? { status } : {}),
    ...(userId ? { userId } : {}),
    ...(companyId ? { job: { company: { id: companyId } } } : {}),
    ...(dispatchStatus === "FAILED"
      ? { externalApplicationId: null, status: { notIn: ["WITHDRAWN"] } }
      : dispatchStatus === "DISPATCHED"
      ? { externalApplicationId: { not: null } }
      : dispatchStatus === "PENDING"
      ? { externalApplicationId: null, status: "APPLIED" }
      : {}),
    ...(search
      ? {
          OR: [
            { user: { email: { contains: search, mode: "insensitive" } } },
            { user: { name: { contains: search, mode: "insensitive" } } },
            { job: { title: { contains: search, mode: "insensitive" } } },
            { job: { company: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          appliedAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    db.application.findMany({
      where,
      select: {
        id: true,
        status: true,
        externalApplicationId: true,
        trackingEmail: true,
        submissionError: true,
        appliedAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true, name: true } },
        job: {
          select: {
            id: true,
            title: true,
            publicJobId: true,
            boardToken: true,
            externalId: true,
            company: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        _count: { select: { emails: true, statusHistory: true } },
      },
      orderBy: { [sortBy]: sortDir },
      skip,
      take: limit,
    }),
    db.application.count({ where }),
  ])

  const data: AdminApplication[] = rows.map((row) => {
    const derived: DispatchStatus = row.externalApplicationId
      ? "DISPATCHED"
      : row.submissionError !== null
      ? "FAILED"
      : row.status === "APPLIED"
      ? "PENDING"
      : "FAILED"

    return { ...row, dispatchStatus: derived }
  })

  return NextResponse.json<ApiResponse<AdminApplication[]>>({
    success: true,
    data,
    meta: { total, page, limit },
  })
}
