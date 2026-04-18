import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound, badRequest } from "../../../_helpers"
import { createNotification } from "@/lib/notifications"
import { z } from "zod"
import type { ApiResponse } from "@/types"

const operatorFailSchema = z.object({
  reason: z.string().min(1).max(1000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const body: unknown = await req.json()
  const parsed = operatorFailSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { reason } = parsed.data

  const app = await db.application.findUnique({
    where: { id },
    include: {
      user: { select: { id: true } },
      job: { select: { title: true, absoluteUrl: true, company: { select: { name: true } } } },
    },
  })
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
        submissionStatus: "FAILED",
        dispatchMode: "ASSISTED",
        claimedByUserId: null,
        claimedAt: null,
        submissionError: reason,
      },
    }),
    db.applicationAuditLog.create({
      data: {
        applicationId: id,
        actorUserId: session.user.id,
        action: "OPERATOR_FAILED",
        metadata: { operatorEmail: session.user.email, reason },
      },
    }),
  ])

  // Notify user that the application could not be submitted
  createNotification({
    userId: app.user.id,
    type: "APPLY_FAILED",
    title: `Application could not be submitted: ${app.job.title} at ${app.job.company.name}`,
    body: "Our team was unable to complete your application submission. Please apply manually via the job link.",
    ctaUrl: app.job.absoluteUrl ?? `/dashboard?app=${id}`,
    ctaLabel: "Apply Manually",
    applicationId: id,
    dedupeKey: `APPLY_FAILED:${id}`,
    suppressEmail: false,
  }).catch((err: unknown) => {
    console.error("[notifications] APPLY_FAILED notification failed after operator-fail:", err)
  })

  return NextResponse.json<ApiResponse<{ success: true }>>({
    success: true,
    data: { success: true },
  })
}
