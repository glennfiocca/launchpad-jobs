import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound } from "../../../_helpers"
import { getPresignedGetUrl } from "@/lib/spaces"
import { signFillPackageToken } from "@/lib/fill-package-jwt"
import type { ApiResponse } from "@/types"

const PRESIGN_TTL = 300 // 5 minutes — warn operator to regenerate after 4 min
const TOKEN_TTL = 900 // 15 minutes

interface FillPackageResponse {
  token: string
  expiresAt: string
  applicationId: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const app = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      submissionStatus: true,
      claimedByUserId: true,
      applicationSnapshot: true,
    },
  })

  if (!app) return notFound("Application not found")

  if (app.submissionStatus !== "AWAITING_OPERATOR") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is not in the operator queue" },
      { status: 400 }
    )
  }

  if (!app.applicationSnapshot) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "No application snapshot available for this application" },
      { status: 400 }
    )
  }

  // Auto-claim if unclaimed
  if (!app.claimedByUserId) {
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
          metadata: { operatorEmail: session.user.email, autoClaimedBy: "fill-package" },
        },
      }),
    ])
  } else if (app.claimedByUserId !== session.user.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is claimed by another operator" },
      { status: 409 }
    )
  }

  const snapshot = app.applicationSnapshot as Record<string, unknown>

  // Fetch a fresh presigned resume URL if we have a Spaces key
  let presignedResumeUrl: string | null = null
  const resumeSpacesKey = snapshot.resumeSpacesKey as string | undefined
  if (resumeSpacesKey) {
    presignedResumeUrl = await getPresignedGetUrl(resumeSpacesKey, PRESIGN_TTL)
  }

  const snapshotWithResume = { ...snapshot, presignedResumeUrl } as Record<string, unknown> & {
    presignedResumeUrl: string | null
  }

  const token = signFillPackageToken(id, snapshotWithResume, TOKEN_TTL)
  const expiresAt = new Date(Date.now() + TOKEN_TTL * 1000).toISOString()

  await db.applicationAuditLog.create({
    data: {
      applicationId: id,
      actorUserId: session.user.id,
      action: "FILL_PACKAGE_ISSUED",
      metadata: { expiresAt, hasResume: !!presignedResumeUrl },
    },
  })

  return NextResponse.json<ApiResponse<FillPackageResponse>>({
    success: true,
    data: { token, expiresAt, applicationId: id },
  })
}
