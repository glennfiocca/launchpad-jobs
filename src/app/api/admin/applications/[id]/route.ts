import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../_helpers"
import { adminUpdateApplicationSchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"
import type { AdminApplicationDetail, DispatchStatus } from "@/types/admin"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const app = await db.application.findUnique({
    where: { id },
    include: {
      user: true,
      job: { include: { company: true } },
      emails: { orderBy: { receivedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
      claimedBy: { select: { id: true, email: true, name: true } },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, email: true, name: true } } },
      },
    },
  })

  if (!app) return notFound("Application not found")

  const dispatchStatus: DispatchStatus = app.externalApplicationId
    ? "DISPATCHED"
    : app.submissionStatus === "AWAITING_OPERATOR"
    ? "AWAITING_OPERATOR"
    : app.submissionStatus === "FAILED"
    ? "FAILED"
    : "PENDING"

  const data: AdminApplicationDetail = {
    id: app.id,
    status: app.status,
    externalApplicationId: app.externalApplicationId,
    trackingEmail: app.trackingEmail,
    submissionError: app.submissionError,
    submissionStatus: app.submissionStatus,
    appliedAt: app.appliedAt,
    updatedAt: app.updatedAt,
    dispatchStatus,
    userNotes: app.userNotes,
    claimedByUserId: app.claimedByUserId,
    claimedAt: app.claimedAt,
    claimedBy: app.claimedBy,
    dispatchMode: app.dispatchMode,
    applicationSnapshot: app.applicationSnapshot as Record<string, unknown> | null,
    user: { id: app.user.id, email: app.user.email, name: app.user.name },
    job: {
      id: app.job.id,
      title: app.job.title,
      publicJobId: app.job.publicJobId,
      boardToken: app.job.boardToken,
      externalId: app.job.externalId,
      company: {
        id: app.job.company.id,
        name: app.job.company.name,
        logoUrl: app.job.company.logoUrl,
      },
    },
    _count: {
      emails: app.emails.length,
      statusHistory: app.statusHistory.length,
    },
    // Map DB field names (from/to/receivedAt) to AdminApplicationDetail shape (fromEmail/toEmail/sentAt)
    emails: app.emails.map((e) => ({
      id: e.id,
      fromEmail: e.from,
      toEmail: e.to,
      subject: e.subject,
      body: e.body,
      direction: e.direction,
      aiClassification: e.aiClassification ?? null,
      aiConfidence: e.aiConfidence ?? null,
      aiReasoning: e.aiReasoning ?? null,
      sentAt: e.receivedAt,
    })),
    statusHistory: app.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason,
      triggeredBy: h.triggeredBy,
      createdAt: h.createdAt,
    })),
    auditLogs: app.auditLogs.map((l) => ({
      id: l.id,
      actorUserId: l.actorUserId,
      actor: l.actor,
      action: l.action,
      metadata: l.metadata as Record<string, unknown> | null,
      createdAt: l.createdAt,
    })),
  }

  return NextResponse.json<ApiResponse<AdminApplicationDetail>>({ success: true, data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const body: unknown = await req.json()
  const parsed = adminUpdateApplicationSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { status, userNotes, reason } = parsed.data

  try {
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.application.findUnique({ where: { id } })
      if (!current) return null

      const patched = await tx.application.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(userNotes !== undefined ? { userNotes } : {}),
        },
      })

      if (status !== undefined && status !== current.status) {
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: id,
            fromStatus: current.status,
            toStatus: status,
            reason: reason ?? null,
            triggeredBy: `admin:${session.user.email}`,
          },
        })
      }

      return patched
    })

    if (!updated) return notFound("Application not found")

    return NextResponse.json<ApiResponse<{ id: string }>>({
      success: true,
      data: { id: updated.id },
    })
  } catch (err) {
    console.error("Failed to update application:", err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to update application" },
      { status: 500 }
    )
  }
}
