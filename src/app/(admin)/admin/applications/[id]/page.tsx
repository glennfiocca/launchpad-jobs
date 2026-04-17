import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import type { AdminApplicationDetail, DispatchStatus } from "@/types"
import { ApplicationDetail } from "@/components/admin/applications/application-detail"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminApplicationDetailPage({ params }: PageProps) {
  const { id } = await params

  const app = await db.application.findUnique({
    where: { id },
    include: {
      user: true,
      job: { include: { company: true } },
      emails: { orderBy: { receivedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!app) notFound()

  const dispatchStatus: DispatchStatus = app.externalApplicationId
    ? "DISPATCHED"
    : app.submissionError !== null
    ? "FAILED"
    : app.status === "APPLIED"
    ? "PENDING"
    : "FAILED"

  const detail: AdminApplicationDetail = {
    id: app.id,
    status: app.status,
    externalApplicationId: app.externalApplicationId,
    trackingEmail: app.trackingEmail,
    submissionError: app.submissionError,
    appliedAt: app.appliedAt,
    updatedAt: app.updatedAt,
    dispatchStatus,
    userNotes: app.userNotes,
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
  }

  return <ApplicationDetail application={detail} />
}
