import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import { sendStatusUpdate } from "@/lib/email";
import type { ApplicationStatus } from "@prisma/client";
import { STATUS_CONFIG } from "@/types";

const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string(),
    to: z.array(z.string()).min(1),
    cc: z.array(z.string()).optional(),
    bcc: z.array(z.string()).optional(),
    subject: z.string(),
    message_id: z.string(),
    created_at: z.string(),
  }),
});

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "");
}

export async function POST(request: Request) {
  const parseResult = resendWebhookSchema.safeParse(await request.json());
  if (!parseResult.success) {
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
      receivedAt: new Date(data.created_at),
    },
  });

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
  }

  return NextResponse.json({ received: true, matched: true });
}
