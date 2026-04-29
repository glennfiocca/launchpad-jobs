import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import type { AdminApplicationDetail, DispatchStatus } from "@/types/admin"
import { ApplicationDetail } from "@/components/admin/applications/application-detail"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminApplicationDetailPage({ params }: PageProps) {
  const [{ id }, session] = await Promise.all([params, getServerSession(authOptions)])
  if (!session?.user?.id) notFound()

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

  if (!app) notFound()

  const dispatchStatus: DispatchStatus = app.externalApplicationId
    ? "DISPATCHED"
    : app.submissionStatus === "AWAITING_OPERATOR"
    ? "AWAITING_OPERATOR"
    : app.submissionStatus === "FAILED"
    ? "FAILED"
    : "PENDING"

  const detail: AdminApplicationDetail = {
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
      provider: app.job.provider,
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

  return <ApplicationDetail application={detail} currentUserId={session.user.id} />
}
