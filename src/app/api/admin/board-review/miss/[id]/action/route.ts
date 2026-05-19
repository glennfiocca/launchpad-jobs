import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../../../_helpers"
import { missActionSchema } from "@/lib/validations/board-review"
import type { ApiResponse } from "@/types"
import type { BoardReviewMiss } from "@prisma/client"

/**
 * POST /api/admin/board-review/miss/[id]/action
 *
 * Terminal-state update for a `BoardReviewMiss` that doesn't go through the
 * resolve flow (i.e. "no public board / skip" → REJECTED, "investigate
 * later" → NEEDS_REVIEW). Does not touch any CompanyBoard.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const body: unknown = await req.json().catch(() => null)
  const parsed = missActionSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const miss = await db.boardReviewMiss.findUnique({ where: { id }, select: { id: true } })
  if (!miss) return notFound("Miss not found")

  const adminId = session.user.id
  const now = new Date()

  try {
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.boardReviewMiss.update({
        where: { id },
        data: {
          reviewStatus: parsed.data.status,
          reviewedAt: now,
          reviewedBy: adminId,
          reviewerNotes: parsed.data.notes ?? null,
        },
      })
      await tx.boardReviewProgress.upsert({
        where: { adminUserId: adminId },
        create: { adminUserId: adminId, lastReviewedMissId: id },
        update: { lastReviewedMissId: id },
      })
      return next
    })

    return NextResponse.json<ApiResponse<BoardReviewMiss>>({ success: true, data: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Failed to update miss: ${message}` },
      { status: 500 }
    )
  }
}

/**
 * "Skip" — bump the pointer without changing the miss's status. Matches
 * the queue skip semantics.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const miss = await db.boardReviewMiss.findUnique({ where: { id }, select: { id: true } })
  if (!miss) return notFound("Miss not found")

  const adminId = session.user.id
  await db.boardReviewProgress.upsert({
    where: { adminUserId: adminId },
    create: { adminUserId: adminId, lastReviewedMissId: id },
    update: { lastReviewedMissId: id },
  })

  return NextResponse.json<ApiResponse<{ id: string }>>({ success: true, data: { id } })
}
