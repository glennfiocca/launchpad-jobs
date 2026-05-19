import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../../_helpers"
import { nextQuerySchema } from "@/lib/validations/board-review"
import { hydrateBoardCard } from "@/lib/board-review/hydrate"
import type { QueueCard, MissCard } from "@/lib/board-review/types"
import type { ApiResponse } from "@/types"

/**
 * Returns the next card the admin should review.
 *
 * Queue urgency formula (see HARDENING spec):
 *   urgency = (suspiciousSlug ? 2 : 1) × log10(activeJobCount + 10)
 *
 * Computed in SQL via a LEFT JOIN against the `Job` table because the
 * active-job count isn't denormalized on `CompanyBoard` yet. Skips the
 * admin's last-reviewed row so re-fetching doesn't loop on the same card.
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const url = new URL(req.url)
  const parsed = nextQuerySchema.safeParse({ kind: url.searchParams.get("kind") ?? undefined })
  if (!parsed.success) return badRequest(parsed.error.message)

  const adminId = session.user.id

  const progress = await db.boardReviewProgress.findUnique({
    where: { adminUserId: adminId },
  })

  if (parsed.data.kind === "queue") {
    return getQueueCard(progress?.lastReviewedBoardId ?? null)
  }
  return getMissCard(progress?.lastReviewedMissId ?? null)
}

interface RawQueueRow {
  id: string
  active_job_count: bigint
}

async function getQueueCard(skipId: string | null): Promise<NextResponse> {
  // Raw query so we can ORDER BY a computed urgency expression that joins
  // against Job. We only need the id (and active count for debugging) here
  // — the full row is hydrated via Prisma below.
  //
  // log10(count + 10) keeps the scale gentle: 0 jobs → 1.0, 90 jobs → 2.0,
  // 990 → 3.0. Multiplied by 2× when suspiciousSlug=true.
  const rows = await db.$queryRaw<RawQueueRow[]>(Prisma.sql`
    SELECT
      cb."id" AS "id",
      COALESCE(jc.active_job_count, 0) AS active_job_count
    FROM "CompanyBoard" cb
    LEFT JOIN (
      SELECT j."provider", j."boardToken", COUNT(*)::bigint AS active_job_count
      FROM "Job" j
      WHERE j."isActive" = true
      GROUP BY j."provider", j."boardToken"
    ) jc ON jc."provider" = cb."provider" AND jc."boardToken" = cb."boardToken"
    WHERE cb."reviewStatus" = 'PENDING'
      AND (${skipId}::text IS NULL OR cb."id" <> ${skipId}::text)
    ORDER BY
      (CASE WHEN cb."suspiciousSlug" THEN 2 ELSE 1 END
        * LOG(10, COALESCE(jc.active_job_count, 0) + 10)) DESC,
      cb."createdAt" DESC
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) {
    return NextResponse.json<ApiResponse<{ card: null }>>({
      success: true,
      data: { card: null },
    })
  }

  const board = await db.companyBoard.findUnique({ where: { id: row.id } })
  if (!board) {
    // Shouldn't happen — id came from the same table moments ago — but
    // protect the caller from a 500 in case of a concurrent delete.
    return NextResponse.json<ApiResponse<{ card: null }>>({
      success: true,
      data: { card: null },
    })
  }

  const card = await hydrateBoardCard(board)
  return NextResponse.json<ApiResponse<{ card: QueueCard }>>({
    success: true,
    data: { card },
  })
}

async function getMissCard(skipId: string | null): Promise<NextResponse> {
  const miss = await db.boardReviewMiss.findFirst({
    where: {
      reviewStatus: "PENDING",
      ...(skipId ? { NOT: { id: skipId } } : {}),
    },
    orderBy: [{ totalJobsTs: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
  })

  if (!miss) {
    return NextResponse.json<ApiResponse<{ card: null }>>({
      success: true,
      data: { card: null },
    })
  }

  const card: MissCard = {
    kind: "miss",
    id: miss.id,
    companyName: miss.companyName,
    companyUrl: miss.companyUrl,
    linkedinUrl: miss.linkedinUrl,
    countryCode: miss.countryCode,
    totalJobsTs: miss.totalJobsTs,
    industry: miss.industry,
    candidatesTried: miss.candidatesTried,
    reviewStatus: miss.reviewStatus,
    reviewerNotes: miss.reviewerNotes,
  }

  return NextResponse.json<ApiResponse<{ card: MissCard }>>({
    success: true,
    data: { card },
  })
}
