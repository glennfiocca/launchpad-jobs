import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import { createNotification } from "@/lib/notifications";
import type { ApiResponse } from "@/types";
import type { NotificationType } from "@prisma/client";

function statusToNotificationType(status: string): NotificationType {
  if (status === "OFFER") return "APPLICATION_OFFER";
  if (status === "PHONE_SCREEN" || status === "INTERVIEWING") return "APPLICATION_INTERVIEW";
  if (status === "REJECTED") return "APPLICATION_REJECTED";
  return "APPLICATION_STATUS_CHANGE";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json() as { emailId: string };

  if (!body.emailId) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "emailId required" }, { status: 400 });
  }

  const application = await db.application.findUnique({ where: { id, userId: session.user.id } });
  if (!application) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Not found" }, { status: 404 });
  }

  const email = await db.applicationEmail.findUnique({
    where: { id: body.emailId, applicationId: id },
  });
  if (!email) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Email not found" }, { status: 404 });
  }

  const classification = await classifyRecruitingEmail(email.subject, email.body, application.status);

  await db.applicationEmail.update({
    where: { id: email.id },
    data: {
      aiClassification: classification.status,
      aiConfidence: classification.confidence,
      aiReasoning: classification.reasoning,
    },
  });

  if (shouldUpdateStatus(application.status, classification.status, classification.confidence)) {
    // Fetch job info for notification content
    const appWithJob = await db.application.findUnique({
      where: { id },
      include: { job: { include: { company: true } } },
    });

    await db.application.update({
      where: { id },
      data: { status: classification.status },
    });
    await db.applicationStatusHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: classification.status,
        reason: `Manual AI re-classification`,
        triggeredBy: "ai",
      },
    });

    if (appWithJob) {
      const notifType = statusToNotificationType(classification.status);
      createNotification({
        userId: application.userId,
        type: notifType,
        title: `Application update: ${appWithJob.job.title} at ${appWithJob.job.company.name}`,
        body: `Status changed to ${classification.status.replace(/_/g, " ").toLowerCase()}.`,
        ctaUrl: `/dashboard?app=${id}`,
        ctaLabel: "View Application",
        applicationId: id,
        jobId: appWithJob.jobId,
        data: {
          type: notifType as "APPLICATION_STATUS_CHANGE",
          applicationId: id,
          fromStatus: application.status,
          toStatus: classification.status as "OFFER",
          jobTitle: appWithJob.job.title,
          companyName: appWithJob.job.company.name,
        },
        dedupeKey: `${notifType}:${id}:${classification.status}`,
      }).catch((err: unknown) => {
        console.error("[notifications] classify notification failed:", err);
      });
    }
  }

  return NextResponse.json<ApiResponse<typeof classification>>({ success: true, data: classification });
}
