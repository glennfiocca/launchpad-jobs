import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../../_helpers"
import { applicationsQuerySchema } from "@/lib/validations/admin"
import { z } from "zod"
import type { DispatchStatus } from "@/types/admin"

const EXPORT_ROW_LIMIT = 10_000

const exportBodySchema = z.object({
  ids: z.array(z.string()).optional(),
  // Filter params are validated separately via applicationsQuerySchema when ids absent
  status: z.string().optional(),
  dispatchStatus: z.enum(["DISPATCHED", "FAILED", "PENDING"]).optional(),
  companyId: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

function escapeCsvValue(value: string | null | undefined): string {
  const str = value ?? ""
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildRow(fields: (string | null | undefined)[]): string {
  return fields.map(escapeCsvValue).join(",")
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body: unknown = await req.json()
  const parsed = exportBodySchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { ids, status, dispatchStatus, companyId, userId, search, dateFrom, dateTo } = parsed.data

  let where: Prisma.ApplicationWhereInput

  if (ids && ids.length > 0) {
    if (ids.length > EXPORT_ROW_LIMIT) {
      return badRequest(`Export limit is ${EXPORT_ROW_LIMIT} rows`)
    }
    where = { id: { in: ids } }
  } else {
    // Validate filter params via applicationsQuerySchema defaults
    const filterParsed = applicationsQuerySchema.safeParse({
      status,
      dispatchStatus,
      companyId,
      userId,
      search,
      dateFrom,
      dateTo,
      page: 1,
      limit: 20,
    })
    if (!filterParsed.success) return badRequest(filterParsed.error.message)

    const f = filterParsed.data

    // Check row count before fetching
    const count = await db.application.count()
    if (count > EXPORT_ROW_LIMIT) {
      return badRequest(
        `Export would exceed ${EXPORT_ROW_LIMIT} rows (${count} matched). Add filters to narrow the result set.`
      )
    }

    where = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.companyId ? { job: { company: { id: f.companyId } } } : {}),
      ...(f.dispatchStatus === "FAILED"
        ? { externalApplicationId: null, status: { notIn: ["WITHDRAWN"] } }
        : f.dispatchStatus === "DISPATCHED"
        ? { externalApplicationId: { not: null } }
        : f.dispatchStatus === "PENDING"
        ? { externalApplicationId: null, status: "APPLIED" }
        : {}),
      ...(f.search
        ? {
            OR: [
              { user: { email: { contains: f.search, mode: "insensitive" } } },
              { user: { name: { contains: f.search, mode: "insensitive" } } },
              { job: { title: { contains: f.search, mode: "insensitive" } } },
              { job: { company: { name: { contains: f.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
      ...(f.dateFrom || f.dateTo
        ? {
            appliedAt: {
              ...(f.dateFrom && { gte: new Date(f.dateFrom) }),
              ...(f.dateTo && { lte: new Date(f.dateTo) }),
            },
          }
        : {}),
    }
  }

  const rows = await db.application.findMany({
    where,
    select: {
      id: true,
      status: true,
      externalApplicationId: true,
      trackingEmail: true,
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
    orderBy: { appliedAt: "desc" },
    take: EXPORT_ROW_LIMIT,
  })

  const header = "id,userEmail,userName,company,jobTitle,status,dispatchStatus,externalApplicationId,trackingEmail,appliedAt"

  const dataRows = rows.map((row) => {
    const derived: DispatchStatus = row.externalApplicationId
      ? "DISPATCHED"
      : row.status === "APPLIED"
      ? "PENDING"
      : "FAILED"

    return buildRow([
      row.id,
      row.user.email,
      row.user.name,
      row.job.company.name,
      row.job.title,
      row.status,
      derived,
      row.externalApplicationId,
      row.trackingEmail,
      row.appliedAt.toISOString(),
    ])
  })

  const csvString = [header, ...dataRows].join("\n")
  const filename = `applications-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csvString, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
