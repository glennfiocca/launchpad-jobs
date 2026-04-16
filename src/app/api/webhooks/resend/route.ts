import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import { sendStatusUpdate } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import type { ApplicationStatus, NotificationType } from "@prisma/client";
import { STATUS_CONFIG } from "@/types";

function statusToNotificationType(status: string): NotificationType {
  if (status === "OFFER") return "APPLICATION_OFFER";
  if (status === "PHONE_SCREEN" || status === "INTERVIEWING") return "APPLICATION_INTERVIEW";
  if (status === "REJECTED") return "APPLICATION_REJECTED";
  return "APPLICATION_STATUS_CHANGE";
}

const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().default(""),
    to: z.union([z.array(z.string()), z.string()]).transform((v) =>
      Array.isArray(v) ? v : [v]
    ),
    cc: z.array(z.string()).nullish(),
    bcc: z.array(z.string()).nullish(),
    subject: z.string().default(""),
    message_id: z.string().nullish(),
    created_at: z.string().optional(),
  }),
});

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

export async function POST(request: Request) {
  const parseResult = resendWebhookSchema.safeParse(await request.json());
  if (!parseResult.success) {
    console.error("Resend webhook parse error:", JSON.stringify(parseResult.error.flatten()));
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { data } = parseResult.data;

  // Locate application by tracking address using a single IN query
  const application = await db.application.findFirst({
    where: { trackingEmail: { in: data.to } },
    include: { user: true, job: { include: { company: true } } },
  });

  if (!application) {
    return NextResponse.json({ received: true, matched: false });
  }

  // Deduplicate by message_id
  const messageId = data.message_id || null;
  if (messageId) {
    const existing = await db.applicationEmail.findUnique({ where: { messageId } });
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  // Fetch email body — not in webhook payload; gracefully degrade if unavailable
  const { data: emailContent } = await getResend().emails.receiving.get(data.email_id);
  const textBody = emailContent?.text ?? "";
  const htmlBody = emailContent?.html ?? null;

  // Persist the email record
  const emailRecord = await db.applicationEmail.create({
    data: {
      applicationId: application.id,
      messageId,
      from: data.from,
      to: data.to.join(", "),
      subject: data.subject,
      body: textBody,
      htmlBody,
      direction: "inbound",
      receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
    },
  });

  // In-app notification for received email (fire-and-forget, webhook must not fail)
  createNotification({
    userId: application.userId,
    type: "EMAIL_RECEIVED",
    title: `New email from ${application.job.company.name}`,
    body: data.subject || "New recruiting email received",
    ctaUrl: `/dashboard`,
    ctaLabel: "View Application",
    applicationId: application.id,
    jobId: application.jobId,
    data: {
      type: "EMAIL_RECEIVED",
      applicationId: application.id,
      emailId: emailRecord.id,
      subject: data.subject,
      from: data.from,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    },
    dedupeKey: `EMAIL_RECEIVED:${emailRecord.id}`,
  }).catch(() => undefined);

  // Skip AI classification if body is empty (content unavailable)
  if (!textBody) {
    return NextResponse.json({ received: true, matched: true });
  }

  // AI classification
  const classification = await classifyRecruitingEmail(
    data.subject,
    textBody,
    application.status,
  );

  await db.applicationEmail.update({
    where: { id: emailRecord.id },
    data: {
      aiClassification: classification.status,
      aiConfidence: classification.confidence,
      aiReasoning: classification.reasoning,
    },
  });

  // Conditionally update application status
  if (shouldUpdateStatus(application.status, classification.status, classification.confidence)) {
    const prevStatus = application.status;

    await db.$transaction([
      db.application.update({
        where: { id: application.id },
        data: { status: classification.status },
      }),
      db.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: prevStatus,
          toStatus: classification.status,
          reason: `AI classified email: "${data.subject}" (confidence: ${Math.round(classification.confidence * 100)}%)`,
          triggeredBy: "ai",
        },
      }),
    ]);

    if (application.user.email && application.user.name) {
      const statusConfig = STATUS_CONFIG[classification.status as ApplicationStatus];
      await sendStatusUpdate({
        to: application.user.email,
        userName: application.user.name,
        jobTitle: application.job.title,
        companyName: application.job.company.name,
        newStatus: classification.status,
        statusLabel: statusConfig.label,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      }).catch((err: unknown) => {
        console.error("Failed to send status update email:", err);
      });
    }

    // In-app status change notification (email suppressed — sendStatusUpdate handles it above)
    const notifType = statusToNotificationType(classification.status);
    createNotification({
      userId: application.userId,
      type: notifType,
      title: `Application update: ${application.job.title} at ${application.job.company.name}`,
      body: `Status changed to ${classification.status.replace(/_/g, " ").toLowerCase()}.`,
      ctaUrl: `/dashboard`,
      ctaLabel: "View Application",
      applicationId: application.id,
      jobId: application.jobId,
      data: {
        type: notifType as "APPLICATION_STATUS_CHANGE",
        applicationId: application.id,
        fromStatus: prevStatus,
        toStatus: classification.status as "OFFER",
        jobTitle: application.job.title,
        companyName: application.job.company.name,
      },
      dedupeKey: `${notifType}:${application.id}:${classification.status}`,
      suppressEmail: true, // sendStatusUpdate already sent it
    }).catch(() => undefined);
  }

  return NextResponse.json({ received: true, matched: true });
}
