import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyToGreenhouseJob } from "@/lib/greenhouse";
import { autoAnswerQuestion } from "@/lib/greenhouse/questions";
import { generateTrackingEmail } from "@/lib/utils";
import { sendApplyConfirmation } from "@/lib/apply-hooks";
import { getPresignedGetUrl } from "@/lib/spaces";
import { checkAndConsumeCredit, FREE_TIER_CREDITS } from "@/lib/credits";
import { z } from "zod";
import type { ApiResponse, ApplicationWithJob, GreenhouseQuestion } from "@/types";

const applySchema = z.object({
  jobId: z.string().min(1),
  additionalAnswers: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const applications = await db.application.findMany({
    where: { userId: session.user.id },
    include: {
      job: { include: { company: true } },
      emails: { orderBy: { receivedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { appliedAt: "desc" },
  });

  return NextResponse.json<ApiResponse<ApplicationWithJob[]>>({
    success: true,
    data: applications as ApplicationWithJob[],
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Get job and profile
  const [job, profile] = await Promise.all([
    db.job.findUnique({ where: { id: parsed.data.jobId }, include: { company: true } }),
    db.userProfile.findUnique({ where: { userId: session.user.id } }),
  ]);

  if (!job) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Job not found" }, { status: 404 });
  }

  if (!profile?.isComplete) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Please complete your profile before applying" },
      { status: 400 }
    );
  }

  // Check if already applied
  const existing = await db.application.findUnique({
    where: { userId_jobId: { userId: session.user.id, jobId: job.id } },
  });
  if (existing) {
    const duplicateMessage =
      existing.status === "WITHDRAWN"
        ? "You withdrew this application and cannot re-apply to this job."
        : "You have already applied to this job";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: duplicateMessage },
      { status: 409 }
    );
  }

  // Check and consume credit before hitting Greenhouse
  const creditCheck = await checkAndConsumeCredit(session.user.id);
  if (!creditCheck.allowed) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: `Free tier limit reached (${FREE_TIER_CREDITS} applications per 24 hours). Upgrade for unlimited applications.`,
        resetsAt: creditCheck.resetsAt.toISOString(),
      },
      { status: 402 }
    );
  }

  // Resolve resume: DB bytes (current) or DO Spaces URL (production)
  let resumeBuffer: Buffer | undefined;
  if (profile.resumeData) {
    resumeBuffer = Buffer.from(profile.resumeData);
  } else if (profile.resumeUrl) {
    try {
      const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
      const presignedUrl = key ? await getPresignedGetUrl(key, 300) : null;
      if (presignedUrl) {
        const res = await fetch(presignedUrl);
        if (res.ok) resumeBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      // Non-fatal: proceed without resume if fetch fails
    }
  }

  // Build question answers: auto-answer from profile, then overlay user-provided answers
  const storedQuestions = job.applicationQuestions
    ? (job.applicationQuestions as unknown as GreenhouseQuestion[])
    : [];

  const questionAnswers: Record<string, string | number> = {};
  for (const question of storedQuestions) {
    const auto = autoAnswerQuestion(question, profile);
    if (auto) Object.assign(questionAnswers, auto);
  }
  Object.assign(questionAnswers, parsed.data.additionalAnswers ?? {});

  // Submit to Greenhouse
  const applyResult = await applyToGreenhouseJob({
    boardToken: job.boardToken,
    jobId: job.externalId,
    profile,
    resumeBuffer,
    resumeFileName: profile.resumeFileName ?? "resume.pdf",
    questionAnswers,
  });

  // Create application record regardless of Greenhouse result
  // (Greenhouse may reject duplicate applications but we still track intent)
  const application = await db.application.create({
    data: {
      userId: session.user.id,
      jobId: job.id,
      status: "APPLIED",
      externalApplicationId: applyResult.applicationId ?? null,
      trackingEmail: generateTrackingEmail(
        // We'll update with real ID after creation
        `${session.user.id.slice(0, 8)}-${job.id.slice(0, 8)}`
      ),
    },
  });

  // Update tracking email with real application ID
  await db.application.update({
    where: { id: application.id },
    data: { trackingEmail: generateTrackingEmail(application.id) },
  });

  // Create initial status history entry
  await db.applicationStatusHistory.create({
    data: {
      applicationId: application.id,
      toStatus: "APPLIED",
      reason: "Application submitted",
      triggeredBy: "user",
    },
  });

  // Fire confirmation email (non-blocking)
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.email) {
    sendApplyConfirmation({
      userEmail: user.email,
      userName: user.name ?? profile.firstName,
      jobTitle: job.title,
      companyName: job.company.name,
      trackingEmail: generateTrackingEmail(application.id),
      appUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
    });
  }

  if (!applyResult.success) {
    // Return partial success: we tracked it but Greenhouse submission failed
    return NextResponse.json<ApiResponse<{ applicationId: string; warning: string }>>({
      success: true,
      data: {
        applicationId: application.id,
        warning: `Application tracked, but auto-submit failed: ${applyResult.error}. Check the job listing to apply manually.`,
      },
    });
  }

  return NextResponse.json<ApiResponse<{ applicationId: string }>>({
    success: true,
    data: { applicationId: application.id },
  });
}
