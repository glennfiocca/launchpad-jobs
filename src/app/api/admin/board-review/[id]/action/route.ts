import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../../_helpers"
import { boardActionSchema } from "@/lib/validations/board-review"
import type { ApiResponse } from "@/types"
import type { CompanyBoard } from "@prisma/client"
import { ReviewStatus } from "@prisma/client"

/**
 * POST /api/admin/board-review/[id]/action
 *
 * Drives a `CompanyBoard` row out of PENDING. REJECT also flips
 * `isActive=false` on the board AND deactivates every Job that hangs off
 * `(provider, boardToken)` so the rejection takes effect immediately.
 *
 * NEEDS_REVIEW deliberately leaves `isActive` untouched per the spec:
 * jobs continue to display while a deeper investigation is pending.
 *
 * Persists the reviewer's progress pointer in the same transaction so a
 * subsequent `GET next` returns a different card.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const body: unknown = await req.json().catch(() => null)
  const parsed = boardActionSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const board = await db.companyBoard.findUnique({ where: { id } })
  if (!board) return notFound("Board not found")

  const adminId = session.user.id
  const now = new Date()

  try {
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.companyBoard.update({
        where: { id },
        data: {
          reviewStatus: parsed.data.status,
          reviewedAt: now,
          reviewedBy: adminId,
          reviewerNotes: parsed.data.notes ?? null,
          // Reject flips isActive off; APPROVED restores isActive=true so a
          // previously-rejected board re-enters sync. NEEDS_REVIEW untouched.
          ...(parsed.data.status === ReviewStatus.REJECTED ? { isActive: false } : {}),
          ...(parsed.data.status === ReviewStatus.APPROVED ? { isActive: true } : {}),
        },
      })

      if (parsed.data.status === ReviewStatus.REJECTED) {
        await tx.job.updateMany({
          where: { provider: board.provider, boardToken: board.boardToken, isActive: true },
          data: { isActive: false },
        })
      }

      await tx.boardReviewProgress.upsert({
        where: { adminUserId: adminId },
        create: { adminUserId: adminId, lastReviewedBoardId: id },
        update: { lastReviewedBoardId: id },
      })

      return next
    })

    return NextResponse.json<ApiResponse<CompanyBoard>>({ success: true, data: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Failed to update board: ${message}` },
      { status: 500 }
    )
  }
}

/**
 * "Skip" — keep PENDING but bump the pointer so the next GET returns a
 * different card. Modeled as a separate verb (`PATCH`) so the action body
 * stays strictly typed as a terminal status.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const board = await db.companyBoard.findUnique({ where: { id }, select: { id: true } })
  if (!board) return notFound("Board not found")

  const adminId = session.user.id

  await db.boardReviewProgress.upsert({
    where: { adminUserId: adminId },
    create: { adminUserId: adminId, lastReviewedBoardId: id },
    update: { lastReviewedBoardId: id },
  })

  return NextResponse.json<ApiResponse<{ id: string }>>({ success: true, data: { id } })
}
