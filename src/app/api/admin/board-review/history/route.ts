import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../../_helpers"
import { historyQuerySchema } from "@/lib/validations/board-review"
import type { ApiResponse } from "@/types"
import type { HistoryPage, HistoryRow } from "@/lib/board-review/types"

/**
 * GET /api/admin/board-review/history
 *
 * Paginated union of CompanyBoard + BoardReviewMiss rows whose
 * reviewStatus is non-PENDING. We fetch each table independently (Prisma
 * doesn't support real cross-table UNIONs without raw SQL), merge by
 * `reviewedAt DESC`, then slice the requested page.
 *
 * To keep memory bounded we cap each underlying fetch at `limit * page +
 * limit` — enough to satisfy any page within the table's contribution
 * range. For the volume we expect (~308 + ~927 reviewed items at peak)
 * this stays well under any concerning row count.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const url = new URL(req.url)
  const parsed = historyQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return badRequest(parsed.error.message)

  const { page, limit } = parsed.data
  const fetchCap = page * limit

  const [boards, misses, boardTotal, missTotal] = await Promise.all([
    db.companyBoard.findMany({
      where: { reviewStatus: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: fetchCap,
      select: {
        id: true,
        name: true,
        reviewStatus: true,
        reviewedAt: true,
        reviewedBy: true,
        reviewerNotes: true,
      },
    }),
    db.boardReviewMiss.findMany({
      where: { reviewStatus: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: fetchCap,
      select: {
        id: true,
        companyName: true,
        reviewStatus: true,
        reviewedAt: true,
        reviewedBy: true,
        reviewerNotes: true,
      },
    }),
    db.companyBoard.count({ where: { reviewStatus: { not: "PENDING" } } }),
    db.boardReviewMiss.count({ where: { reviewStatus: { not: "PENDING" } } }),
  ])

  const merged: HistoryRow[] = [
    ...boards.map<HistoryRow>((b) => ({
      kind: "board",
      id: b.id,
      name: b.name,
      reviewStatus: b.reviewStatus,
      reviewedAt: b.reviewedAt ? b.reviewedAt.toISOString() : null,
      reviewedBy: b.reviewedBy,
      reviewerNotes: b.reviewerNotes,
    })),
    ...misses.map<HistoryRow>((m) => ({
      kind: "miss",
      id: m.id,
      name: m.companyName,
      reviewStatus: m.reviewStatus,
      reviewedAt: m.reviewedAt ? m.reviewedAt.toISOString() : null,
      reviewedBy: m.reviewedBy,
      reviewerNotes: m.reviewerNotes,
    })),
  ].sort((a, b) => {
    if (a.reviewedAt && b.reviewedAt) return b.reviewedAt.localeCompare(a.reviewedAt)
    if (a.reviewedAt) return -1
    if (b.reviewedAt) return 1
    return 0
  })

  const start = (page - 1) * limit
  const rows = merged.slice(start, start + limit)

  const payload: HistoryPage = {
    rows,
    total: boardTotal + missTotal,
    page,
    pageSize: limit,
  }

  return NextResponse.json<ApiResponse<HistoryPage>>({ success: true, data: payload })
}
