import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../../../_helpers"
import { missResolveSchema } from "@/lib/validations/board-review"
import { probeBoard } from "@/lib/board-review/probe"
import type { ApiResponse } from "@/types"
import type { CompanyBoard } from "@prisma/client"

/**
 * POST /api/admin/board-review/miss/[id]/resolve
 *
 * Promotes a `BoardReviewMiss` to a real `CompanyBoard`. Re-validates the
 * slug server-side (the admin already validated client-side, but never
 * trust a probe-result we didn't run ourselves). On success:
 *   1. Create or fetch the `CompanyBoard` (idempotent via unique index)
 *      with reviewStatus=APPROVED (the admin just hand-verified it).
 *   2. Link the miss via `resolvedCompanyBoardId` and mark it APPROVED.
 *   3. Bump the admin's progress pointer.
 *
 * All three steps run inside a transaction so a partial failure leaves
 * neither table in an inconsistent state.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const body: unknown = await req.json().catch(() => null)
  const parsed = missResolveSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const miss = await db.boardReviewMiss.findUnique({ where: { id } })
  if (!miss) return notFound("Miss not found")

  const probe = await probeBoard(parsed.data.slug, parsed.data.ats)
  if (!probe.ok) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: probe.error ?? "Board did not validate" },
      { status: 400 }
    )
  }

  const adminId = session.user.id
  const now = new Date()
  const resolvedName = probe.boardName ?? miss.companyName

  try {
    const board = await db.$transaction<CompanyBoard>(async (tx) => {
      const created = await tx.companyBoard.upsert({
        where: {
          provider_boardToken: { provider: parsed.data.ats, boardToken: parsed.data.slug },
        },
        create: {
          name: resolvedName,
          boardToken: parsed.data.slug,
          provider: parsed.data.ats,
          isActive: true,
          reviewStatus: "APPROVED",
          reviewedAt: now,
          reviewedBy: adminId,
          reviewerNotes: parsed.data.notes ?? null,
        },
        update: {
          reviewStatus: "APPROVED",
          reviewedAt: now,
          reviewedBy: adminId,
          isActive: true,
        },
      })

      await tx.boardReviewMiss.update({
        where: { id },
        data: {
          reviewStatus: "APPROVED",
          manuallyProvidedSlug: parsed.data.slug,
          manuallyProvidedAts: parsed.data.ats,
          resolvedCompanyBoardId: created.id,
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

      return created
    })

    return NextResponse.json<ApiResponse<CompanyBoard>>({ success: true, data: board })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Failed to resolve miss: ${message}` },
      { status: 500 }
    )
  }
}
