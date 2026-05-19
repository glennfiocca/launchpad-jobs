import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../_helpers"
import { revertSchema } from "@/lib/validations/board-review"
import type { ApiResponse } from "@/types"

/**
 * POST /api/admin/board-review/revert
 *
 * Drops a previously-actioned row back to PENDING. Clears the audit fields
 * (reviewedAt/reviewedBy/notes) so the row looks pristine on the next
 * review pass. Branches on `kind` so a single endpoint handles both
 * CompanyBoard and BoardReviewMiss reverts — keeps the History UI simple.
 *
 * NOTE: Revert intentionally does NOT re-activate jobs that REJECTED-on-board
 * deactivated. The admin must approve the board again to bring the jobs
 * back; the next sync will flip them on. That guardrail is mirrored in the
 * queue card's "previously rejected" banner.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body: unknown = await req.json().catch(() => null)
  const parsed = revertSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  try {
    if (parsed.data.kind === "board") {
      const board = await db.companyBoard.findUnique({ where: { id: parsed.data.id } })
      if (!board) return notFound("Board not found")
      const updated = await db.companyBoard.update({
        where: { id: parsed.data.id },
        data: {
          reviewStatus: "PENDING",
          reviewedAt: null,
          reviewedBy: null,
          reviewerNotes: null,
        },
      })
      return NextResponse.json<ApiResponse<{ id: string; reviewStatus: string }>>({
        success: true,
        data: { id: updated.id, reviewStatus: updated.reviewStatus },
      })
    }

    const miss = await db.boardReviewMiss.findUnique({ where: { id: parsed.data.id } })
    if (!miss) return notFound("Miss not found")
    const updated = await db.boardReviewMiss.update({
      where: { id: parsed.data.id },
      data: {
        reviewStatus: "PENDING",
        reviewedAt: null,
        reviewedBy: null,
        reviewerNotes: null,
      },
    })
    return NextResponse.json<ApiResponse<{ id: string; reviewStatus: string }>>({
      success: true,
      data: { id: updated.id, reviewStatus: updated.reviewStatus },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Failed to revert: ${message}` },
      { status: 500 }
    )
  }
}
