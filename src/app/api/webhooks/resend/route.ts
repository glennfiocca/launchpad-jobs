import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import { sendStatusUpdate } from "@/lib/email";
import { sendApplyConfirmation } from "@/lib/apply-hooks";
import { createNotification } from "@/lib/notifications";
import type { ApplicationStatus, NotificationType } from "@prisma/client";
import { STATUS_CONFIG } from "@/types";

// Application statuses that confirm a submission went through
const SUBMISSION_CONFIRMING_STATUSES = new Set<ApplicationStatus>([
  "APPLIED", "REVIEWING", "PHONE_SCREEN", "INTERVIEWING", "OFFER",
]);

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

    // In-app status change notification type — also drives the unsubscribe target
    const notifType = statusToNotificationType(classification.status);

    if (application.user.email && application.user.name) {
      const statusConfig = STATUS_CONFIG[classification.status as ApplicationStatus];
      await sendStatusUpdate({
        to: application.user.email,
        userId: application.userId,
        unsubscribeType: notifType,
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

  // Auto-confirm operator-queue applications when a submission confirmation arrives.
  // Any inbound email at the tracking address with a forward-moving classification
  // is ground truth that the ATS accepted the form — the operator submitted successfully.
  // This is idempotent: if operator-complete already ran, submissionStatus !== AWAITING_OPERATOR
  // and this block is skipped. If this runs first, operator-complete returns 400.
  if (
    application.submissionStatus === "AWAITING_OPERATOR" &&
    SUBMISSION_CONFIRMING_STATUSES.has(classification.status) &&
    classification.confidence >= 0.75
  ) {
    await db.$transaction([
      db.application.update({
        where: { id: application.id },
        data: {
          submissionStatus: "SUBMITTED",
          dispatchMode: "ASSISTED",
          claimedByUserId: null,
          claimedAt: null,
        },
      }),
      db.applicationAuditLog.create({
        data: {
          applicationId: application.id,
          action: "SUBMISSION_CONFIRMED_BY_EMAIL",
          metadata: {
            emailSubject: data.subject,
            aiClassification: classification.status,
            aiConfidence: classification.confidence,
            aiReasoning: classification.reasoning,
          },
        },
      }),
    ]);

    // Send the APPLIED notification that was suppressed when routing to the operator queue
    createNotification({
      userId: application.userId,
      type: "APPLIED",
      title: `Applied to ${application.job.title} at ${application.job.company.name}`,
      body: "Your application was submitted successfully.",
      ctaUrl: `/dashboard?app=${application.id}`,
      ctaLabel: "View Dashboard",
      applicationId: application.id,
      dedupeKey: `APPLIED:${application.id}`,
      suppressEmail: true,
    }).catch(() => undefined);

    // Send confirmation email to the user
    if (application.user.email) {
      sendApplyConfirmation({
        userEmail: application.user.email,
        userName: application.user.name ?? application.user.email,
        jobTitle: application.job.title,
        companyName: application.job.company.name,
        appUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
      });
    }

    console.log(
      `[operator-queue] Auto-confirmed submission for application ${application.id} ` +
      `via inbound email (${classification.status}, ${Math.round(classification.confidence * 100)}% confidence)`
    );
  }

  return NextResponse.json({ received: true, matched: true });
}
