import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyToGreenhouseJob } from "@/lib/greenhouse";
import { autoAnswerQuestion, getUnansweredQuestions } from "@/lib/greenhouse/questions";
import { generateTrackingEmail } from "@/lib/utils";
import { sendApplyConfirmation } from "@/lib/apply-hooks";
import { createNotification } from "@/lib/notifications";
import { getPresignedGetUrl } from "@/lib/spaces";
import { checkAndConsumeCredit, FREE_TIER_CREDITS } from "@/lib/credits";
import { z } from "zod";
import type { ApiResponse, ApplicationWithJob, GreenhouseQuestion, QuestionMeta, PendingQuestion } from "@/types";
import type { UserProfile } from "@prisma/client";

// Error codes that route to the operator queue instead of hard-failing
const OPERATOR_QUEUE_CODES = new Set(
  (process.env.OPERATOR_QUEUE_CODES ?? "CAPTCHA_REQUIRED,BROWSER_LAUNCH_FAILED,NO_CONFIRMATION").split(",")
);

interface ApplicationSnapshot {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  boardToken: string;
  externalId: string;
  manualApplyUrl?: string;
  resumeFileName?: string;
  resumeSpacesKey?: string;
  trackingEmail?: string;
  questionAnswers: Record<string, string>;
  questionMeta: QuestionMeta[];
  pendingQuestions: PendingQuestion[];
  snapshotAt: string;
  coreFieldExtras?: {
    preferredFirstName?: string;
    country?: string;
    eeoc?: {
      gender?: string;
      race?: string;
      veteranStatus?: string;
      disability?: string;
    };
  };
}

const COUNTRY_ALIASES: Record<string, string> = {
  "us": "United States",
  "usa": "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  "uk": "United Kingdom",
  "gb": "United Kingdom",
  "great britain": "United Kingdom",
  "england": "United Kingdom",
  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  "de": "Germany",
  "deutschland": "Germany",
  "fr": "France",
  "au": "Australia",
  "nz": "New Zealand",
  "br": "Brazil",
  "brasil": "Brazil",
  "mx": "Mexico",
  "méxico": "Mexico",
  "in": "India",
  "jp": "Japan",
  "cn": "China",
  "kr": "South Korea",
  "south korea": "South Korea",
  "s. korea": "South Korea",
  "s.korea": "South Korea",
  "sg": "Singapore",
  "nl": "Netherlands",
  "the netherlands": "Netherlands",
  "es": "Spain",
  "españa": "Spain",
  "it": "Italy",
  "italia": "Italy",
  "se": "Sweden",
  "no": "Norway",
  "dk": "Denmark",
  "fi": "Finland",
  "pl": "Poland",
  "ch": "Switzerland",
  "at": "Austria",
  "be": "Belgium",
  "pt": "Portugal",
  "ie": "Ireland",
  "il": "Israel",
  "tr": "Turkey",
  "türkiye": "Turkey",
  "za": "South Africa",
  "ng": "Nigeria",
  "ke": "Kenya",
  "eg": "Egypt",
  "ar": "Argentina",
  "cl": "Chile",
  "co": "Colombia",
  "pe": "Peru",
  "ph": "Philippines",
  "id": "Indonesia",
  "my": "Malaysia",
  "th": "Thailand",
  "vn": "Vietnam",
  "pk": "Pakistan",
  "bd": "Bangladesh",
  "hk": "Hong Kong",
  "tw": "Taiwan",
}

function normalizeCountry(raw: string): string {
  const key = raw.toLowerCase().trim()
  return COUNTRY_ALIASES[key] ?? raw
}

function buildSnapshot(
  profile: UserProfile,
  boardToken: string,
  externalId: string,
  questions: GreenhouseQuestion[],
  questionAnswers: Record<string, string | number>,
  trackingEmail: string,
  manualApplyUrl?: string
): ApplicationSnapshot {
  // Extract Spaces key from resumeUrl (not a presigned URL — stable reference)
  const resumeSpacesKey = profile.resumeUrl
    ? profile.resumeUrl.split(".digitaloceanspaces.com/")[1] ?? undefined
    : undefined;

  const stringAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(questionAnswers)) {
    stringAnswers[k] = String(v);
  }

  // Build questionMeta: one entry per answered field (supports multi-field questions)
  const questionMeta: QuestionMeta[] = [];
  for (const question of questions) {
    for (const field of question.fields) {
      if (!(field.name in stringAnswers)) continue;
      questionMeta.push({
        label: question.label,
        fieldName: field.name,
        fieldType: field.type,
        ...(field.type === "multi_value_single_select" || field.type === "multi_value_multi_select"
          ? { selectValues: field.values }
          : {}),
      });
    }
  }

  // Build pendingQuestions: one entry per field for unanswered questions
  const unanswered = getUnansweredQuestions(questions, profile);
  const pendingQuestions: PendingQuestion[] = unanswered.flatMap((q) => {
    if (q.fields.length === 0) {
      return [{ label: q.label, fieldName: "", fieldType: "input_text" as const, required: q.required, description: q.description }];
    }
    return q.fields.map((field) => ({
      label: q.label,
      fieldName: field.name,
      fieldType: field.type,
      required: q.required,
      description: q.description,
      ...(field.type === "multi_value_single_select" || field.type === "multi_value_multi_select"
        ? { selectValues: field.values }
        : {}),
      // Hydrate userAnswer if modal already answered this field
      ...(field.name && stringAnswers[field.name] ? { userAnswer: stringAnswers[field.name] } : {}),
    }));
  });

  // Build coreFieldExtras: preferred name, country, EEOC for extension/operator
  const countryRaw = (profile.locationFormatted ?? profile.location ?? "").split(",").at(-1)?.trim() || undefined;
  const coreFieldExtras: ApplicationSnapshot["coreFieldExtras"] = {};
  if (profile.preferredFirstName) coreFieldExtras.preferredFirstName = profile.preferredFirstName;
  if (countryRaw) coreFieldExtras.country = normalizeCountry(countryRaw);
  if (profile.voluntaryGender || profile.voluntaryRace || profile.voluntaryVeteranStatus || profile.voluntaryDisability) {
    coreFieldExtras.eeoc = {
      ...(profile.voluntaryGender ? { gender: profile.voluntaryGender } : {}),
      ...(profile.voluntaryRace ? { race: profile.voluntaryRace } : {}),
      ...(profile.voluntaryVeteranStatus ? { veteranStatus: profile.voluntaryVeteranStatus } : {}),
      ...(profile.voluntaryDisability ? { disability: profile.voluntaryDisability } : {}),
    };
  }

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone ?? undefined,
    location: profile.locationFormatted ?? profile.location ?? undefined,
    boardToken,
    externalId,
    manualApplyUrl,
    resumeFileName: profile.resumeFileName ?? undefined,
    resumeSpacesKey,
    trackingEmail,
    questionAnswers: stringAnswers,
    questionMeta,
    pendingQuestions,
    snapshotAt: new Date().toISOString(),
    ...(Object.keys(coreFieldExtras).length > 0 ? { coreFieldExtras } : {}),
  };
}

const applySchema = z.object({
  jobId: z.string().min(1),
  additionalAnswers: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional(),
});

async function runPlaywrightSubmission(opts: {
  applicationId: string;
  boardToken: string;
  externalJobId: string;
  profile: UserProfile;
  trackingEmail: string;
  resumeBuffer: Buffer | undefined;
  resumeFileName: string;
  questionAnswers: Record<string, string | number>;
  questions: GreenhouseQuestion[];
  userId: string;
  jobTitle: string;
  companyName: string;
  userEmail: string | null;
  userName: string;
}): Promise<void> {
  try {
    const applyResult = await applyToGreenhouseJob({
      boardToken: opts.boardToken,
      jobId: opts.externalJobId,
      profile: opts.profile,
      trackingEmail: opts.trackingEmail,
      resumeBuffer: opts.resumeBuffer,
      resumeFileName: opts.resumeFileName,
      questionAnswers: opts.questionAnswers,
      preferredFirstName: opts.profile.preferredFirstName ?? undefined,
    });

    if (applyResult.success) {
      await db.application.update({
        where: { id: opts.applicationId },
        data: {
          submissionStatus: "SUBMITTED",
          externalApplicationId: applyResult.applicationId ?? null,
        },
      });
      await db.applicationStatusHistory.create({
        data: {
          applicationId: opts.applicationId,
          toStatus: "APPLIED",
          reason: "Application submitted to Greenhouse successfully",
          triggeredBy: "system",
        },
      });
      if (opts.userEmail) {
        sendApplyConfirmation({
          userEmail: opts.userEmail,
          userName: opts.userName,
          jobTitle: opts.jobTitle,
          companyName: opts.companyName,
          appUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
        });
      }
      createNotification({
        userId: opts.userId,
        type: "APPLIED",
        title: `Applied to ${opts.jobTitle} at ${opts.companyName}`,
        body: "Your application was submitted successfully.",
        ctaUrl: `/dashboard?app=${opts.applicationId}`,
        ctaLabel: "View Dashboard",
        applicationId: opts.applicationId,
        dedupeKey: `APPLIED:${opts.applicationId}`,
        suppressEmail: true,
      }).catch((err: unknown) => {
        console.error("[notifications] APPLIED notification failed:", err);
      });
    } else {
      const errorCode = applyResult.errorCode ?? "PLAYWRIGHT_ERROR";

      if (OPERATOR_QUEUE_CODES.has(errorCode)) {
        // Route to operator queue — do NOT send APPLY_FAILED notification
        // User-facing dashboard shows "Finalizing submission" for AWAITING_OPERATOR
        const snapshot = buildSnapshot(
          opts.profile,
          opts.boardToken,
          opts.externalJobId,
          opts.questions,
          opts.questionAnswers,
          opts.trackingEmail,
          applyResult.manualApplyUrl
        );

        await db.application.update({
          where: { id: opts.applicationId },
          data: {
            submissionStatus: "AWAITING_OPERATOR",
            submissionError: errorCode,
            applicationSnapshot: snapshot as object,
          },
        });

        await db.applicationAuditLog.create({
          data: {
            applicationId: opts.applicationId,
            action: "PLAYWRIGHT_RESULT",
            metadata: { errorCode, manualApplyUrl: applyResult.manualApplyUrl ?? null },
          },
        });

        const requiredPending = snapshot.pendingQuestions.filter((q) => q.required && !q.userAnswer);
        if (requiredPending.length > 0) {
          createNotification({
            userId: opts.userId,
            type: "SYSTEM",
            title: `Action required: answer ${requiredPending.length} question${requiredPending.length !== 1 ? "s" : ""} to complete your application`,
            body: `Your application to ${opts.jobTitle} at ${opts.companyName} needs ${requiredPending.length} additional answer${requiredPending.length !== 1 ? "s" : ""} before it can be submitted.`,
            ctaUrl: `/applications/${opts.applicationId}/questions`,
            ctaLabel: "Answer Questions",
            applicationId: opts.applicationId,
          }).catch((err: unknown) => {
            console.error("[notifications] pending questions notification failed:", err);
          });
        }
      } else {
        // Terminal failure — not recoverable by operator
        await db.application.update({
          where: { id: opts.applicationId },
          data: {
            submissionStatus: "FAILED",
            submissionError: applyResult.error ?? errorCode,
          },
        });

        createNotification({
          userId: opts.userId,
          type: "APPLIED",
          title: `Action required: ${opts.jobTitle} at ${opts.companyName}`,
          body: "Automation failed to submit your application. Please apply manually via the job link.",
          ctaUrl: applyResult.manualApplyUrl ?? `/dashboard?app=${opts.applicationId}`,
          ctaLabel: "View Job",
          applicationId: opts.applicationId,
          dedupeKey: `APPLY_FAILED:${opts.applicationId}`,
          suppressEmail: false,
        }).catch((err: unknown) => {
          console.error("[notifications] APPLY_FAILED notification failed:", err);
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Playwright crashed";
    console.error("[apply] Background submission error:", err);
    await db.application
      .update({
        where: { id: opts.applicationId },
        data: { submissionStatus: "FAILED", submissionError: msg },
      })
      .catch((dbErr: unknown) => {
        console.error("[apply] Failed to persist submission error:", dbErr);
      });
  }
}

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

  // Check A — isActive guard: bail early if job is marked inactive in DB
  if (!job.isActive) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: "This job listing is no longer active. It may have been filled or removed.",
      },
      { status: 422 }
    );
  }

  // Check B — URL redirect probe: lightweight HEAD to detect closed/redirected listings
  if (job.absoluteUrl) {
    try {
      const probeRes = await fetch(job.absoluteUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });

      const isRedirect = probeRes.status >= 300 && probeRes.status < 400;
      if (isRedirect) {
        const location = probeRes.headers.get("location") ?? "";
        const isGreenhouseRedirect =
          location.startsWith("/") || // relative redirect = still on Greenhouse's domain
          location.includes("greenhouse.io") ||
          location.includes("job-boards");

        if (!isGreenhouseRedirect) {
          // Job redirects away from Greenhouse — mark inactive and reject
          await db.job.update({
            where: { id: job.id },
            data: { isActive: false },
          });
          return NextResponse.json<ApiResponse<never>>(
            {
              success: false,
              error: "This job listing appears to have been removed. We've updated our records.",
            },
            { status: 422 }
          );
        }
      } else if ([404, 410, 451].includes(probeRes.status)) {
        // Definitive "gone" response — mark inactive and reject
        await db.job.update({
          where: { id: job.id },
          data: { isActive: false },
        });
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: "This job listing appears to have been removed. We've updated our records.",
          },
          { status: 422 }
        );
      }
      // All other non-2xx responses (405, 501, 503, etc.) — fail open, Greenhouse doesn't support HEAD
    } catch {
      // Probe timed out or errored — fail open, proceed with Playwright submission
    }
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

  // Step 1: Create Application record to get the real ID
  const application = await db.application.create({
    data: {
      userId: session.user.id,
      jobId: job.id,
      status: "APPLIED",
      externalApplicationId: null,
      trackingEmail: generateTrackingEmail(`${session.user.id.slice(0, 8)}-${job.id.slice(0, 8)}`),
    },
  });

  // Step 2: Generate tracking email from real ID and persist immediately
  const trackingEmail = generateTrackingEmail(application.id);
  await db.application.update({
    where: { id: application.id },
    data: { trackingEmail },
  });

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

  // Fetch user for email/name (needed by background task)
  const user = await db.user.findUnique({ where: { id: session.user.id } });

  // Fire Playwright submission in background — do NOT await.
  // DO App Platform has a hard 30s HTTP timeout; Playwright takes 30-60s.
  // We return 200 immediately; the background task updates the DB when done.
  void runPlaywrightSubmission({
    applicationId: application.id,
    boardToken: job.boardToken,
    externalJobId: job.externalId,
    profile,
    trackingEmail,
    resumeBuffer,
    resumeFileName: profile.resumeFileName ?? "resume.pdf",
    questionAnswers,
    questions: storedQuestions,
    userId: session.user.id,
    jobTitle: job.title,
    companyName: job.company.name,
    userEmail: user?.email ?? null,
    userName: user?.name ?? profile.firstName,
  });

  return NextResponse.json<ApiResponse<{ applicationId: string }>>({
    success: true,
    data: { applicationId: application.id },
  });
}
