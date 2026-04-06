import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import { sendStatusUpdate } from "@/lib/email";
import type { ApplicationStatus } from "@prisma/client";
import { STATUS_CONFIG } from "@/types";

// Resend inbound email webhook payload type
interface ResendInboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId?: string;
  date?: string;
}

// Verify webhook came from Resend (simple secret check)
function verifyWebhookSecret(req: Request): boolean {
  const headersList = headers();
  const secret = (headersList as unknown as Map<string, string>).get("x-resend-signature") ?? "";
  return !process.env.RESEND_INBOUND_SECRET || secret === process.env.RESEND_INBOUND_SECRET;
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ResendInboundEmail;
  try {
    payload = await request.json() as ResendInboundEmail;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { from, to, subject, text, html, messageId, date } = payload;

  // Find the application by tracking email address
  // The "to" field contains the tracking address like app-{id}@track.launchpad.jobs
  const toAddresses = Array.isArray(to) ? to : [to];

  let application = null;
  for (const toAddr of toAddresses) {
    application = await db.application.findUnique({
      where: { trackingEmail: toAddr },
      include: { user: true, job: { include: { company: true } } },
    });
    if (application) break;
  }

  if (!application) {
    // Not a tracked application email — ignore
    return NextResponse.json({ received: true, matched: false });
  }

  // Deduplicate by messageId
  if (messageId) {
    const existing = await db.applicationEmail.findUnique({ where: { messageId } });
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  // Store the email
  const emailRecord = await db.applicationEmail.create({
    data: {
      applicationId: application.id,
      messageId: messageId ?? null,
      from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      body: text,
      htmlBody: html ?? null,
      direction: "inbound",
      receivedAt: date ? new Date(date) : new Date(),
    },
  });

  // AI classify the email
  const classification = await classifyRecruitingEmail(subject, text, application.status);

  // Update email record with AI classification
  await db.applicationEmail.update({
    where: { id: emailRecord.id },
    data: {
      aiClassification: classification.status,
      aiConfidence: classification.confidence,
      aiReasoning: classification.reasoning,
    },
  });

  // Update application status if appropriate
  if (shouldUpdateStatus(application.status, classification.status, classification.confidence)) {
    const prevStatus = application.status;

    await db.application.update({
      where: { id: application.id },
      data: { status: classification.status },
    });

    await db.applicationStatusHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: prevStatus,
        toStatus: classification.status,
        reason: `AI classified email: "${subject}" (confidence: ${Math.round(classification.confidence * 100)}%)`,
        triggeredBy: "ai",
      },
    });

    // Notify user of status change
    if (application.user.email && application.user.name) {
      const statusConfig = STATUS_CONFIG[classification.status as ApplicationStatus];
      const appUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

      await sendStatusUpdate({
        to: application.user.email,
        userName: application.user.name,
        jobTitle: application.job.title,
        companyName: application.job.company.name,
        newStatus: classification.status,
        statusLabel: statusConfig.label,
        dashboardUrl: appUrl,
      }).catch((err) => {
        console.error("Failed to send status update email:", err);
      });
    }
  }

  return NextResponse.json({ received: true, matched: true, classification });
}
