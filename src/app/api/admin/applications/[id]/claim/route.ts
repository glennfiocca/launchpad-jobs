import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound } from "../../../_helpers"
import type { ApiResponse } from "@/types"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const app = await db.application.findUnique({ where: { id } })
  if (!app) return notFound("Application not found")

  if (app.submissionStatus !== "AWAITING_OPERATOR") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is not in the operator queue" },
      { status: 400 }
    )
  }

  // Atomic claim — reject if already claimed by someone else
  if (app.claimedByUserId && app.claimedByUserId !== session.user.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is already claimed by another operator" },
      { status: 409 }
    )
  }

  // Already claimed by this user — idempotent
  if (app.claimedByUserId === session.user.id) {
    return NextResponse.json<ApiResponse<{ applicationId: string }>>({
      success: true,
      data: { applicationId: id },
    })
  }

  await db.$transaction([
    db.application.update({
      where: { id },
      data: { claimedByUserId: session.user.id, claimedAt: new Date() },
    }),
    db.applicationAuditLog.create({
      data: {
        applicationId: id,
        actorUserId: session.user.id,
        action: "CLAIM",
        metadata: { operatorEmail: session.user.email },
      },
    }),
  ])

  return NextResponse.json<ApiResponse<{ applicationId: string }>>({
    success: true,
    data: { applicationId: id },
  })
}
