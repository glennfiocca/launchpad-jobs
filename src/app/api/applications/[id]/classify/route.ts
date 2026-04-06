import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { classifyRecruitingEmail, shouldUpdateStatus } from "@/lib/ai";
import type { ApiResponse } from "@/types";

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
  }

  return NextResponse.json<ApiResponse<typeof classification>>({ success: true, data: classification });
}
