import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../../_helpers"
import { z } from "zod"
import type { ApiResponse } from "@/types"
import type { OperatorQueueApplication, DispatchStatus } from "@/types/admin"
import { OPERATOR_SUMMARY_KIND } from "@/lib/pdf/application-summary-data"

const queueQuerySchema = z.object({
  filter: z.enum(["unclaimed", "mine", "all"]).default("unclaimed"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["appliedAt", "claimedAt"]).default("appliedAt"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
})

export async function GET(req: NextRequest) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = queueQuerySchema.safeParse(params)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { filter, page, limit, sortBy, sortDir } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    submissionStatus: "AWAITING_OPERATOR",
    ...(filter === "unclaimed"
      ? { claimedByUserId: null }
      : filter === "mine"
      ? { claimedByUserId: session.user.id }
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
        submissionStatus: true,
        claimedByUserId: true,
        claimedAt: true,
        dispatchMode: true,
        appliedAt: true,
        updatedAt: true,
        claimedBy: { select: { id: true, email: true, name: true } },
        user: { select: { id: true, email: true, name: true } },
        job: {
          select: {
            id: true,
            title: true,
            publicJobId: true,
            boardToken: true,
            externalId: true,
            provider: true,
            absoluteUrl: true,
            company: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        _count: { select: { emails: true, statusHistory: true } },
        documents: {
          where: { kind: OPERATOR_SUMMARY_KIND },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { [sortBy]: sortDir },
      skip,
      take: limit,
    }),
    db.application.count({ where }),
  ])

  const data: OperatorQueueApplication[] = rows.map(({ documents, ...row }) => ({
    ...row,
    dispatchStatus: "AWAITING_OPERATOR" as DispatchStatus,
    applicationSnapshot: null,
    hasSummaryPdf: documents.length > 0,
  }))

  return NextResponse.json<ApiResponse<OperatorQueueApplication[]>>({
    success: true,
    data,
    meta: { total, page, limit },
  })
}
