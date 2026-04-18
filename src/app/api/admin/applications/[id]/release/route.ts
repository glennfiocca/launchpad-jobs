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

  if (!app.claimedByUserId) {
    return NextResponse.json<ApiResponse<{ applicationId: string }>>({
      success: true,
      data: { applicationId: id },
    })
  }

  // Only the claiming operator (or any admin for force-release) can release
  if (app.claimedByUserId !== session.user.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "You cannot release an application claimed by another operator" },
      { status: 403 }
    )
  }

  await db.$transaction([
    db.application.update({
      where: { id },
      data: { claimedByUserId: null, claimedAt: null },
    }),
    db.applicationAuditLog.create({
      data: {
        applicationId: id,
        actorUserId: session.user.id,
        action: "RELEASE",
        metadata: { operatorEmail: session.user.email },
      },
    }),
  ])

  return NextResponse.json<ApiResponse<{ applicationId: string }>>({
    success: true,
    data: { applicationId: id },
  })
}
