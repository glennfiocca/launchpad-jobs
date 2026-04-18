import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound, badRequest } from "../../../_helpers"
import { z } from "zod"
import type { ApiResponse } from "@/types"

const operatorCompleteSchema = z.object({
  externalApplicationId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const body: unknown = await req.json()
  const parsed = operatorCompleteSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { externalApplicationId, notes } = parsed.data

  const app = await db.application.findUnique({ where: { id } })
  if (!app) return notFound("Application not found")

  if (app.submissionStatus !== "AWAITING_OPERATOR") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is not in the operator queue" },
      { status: 400 }
    )
  }

  await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        submissionStatus: "SUBMITTED",
        dispatchMode: "ASSISTED",
        claimedByUserId: null,
        claimedAt: null,
        ...(externalApplicationId ? { externalApplicationId } : {}),
      },
    }),
    db.applicationAuditLog.create({
      data: {
        applicationId: id,
        actorUserId: session.user.id,
        action: "OPERATOR_SUBMITTED",
        metadata: {
          operatorEmail: session.user.email,
          externalApplicationId: externalApplicationId ?? null,
          notes: notes ?? null,
        },
      },
    }),
  ])

  return NextResponse.json<ApiResponse<{ success: true }>>({
    success: true,
    data: { success: true },
  })
}
