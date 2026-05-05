import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound } from "../../../_helpers"
import { getApplyStrategy } from "@/lib/ats/registry"
import { initializeAtsProviders } from "@/lib/ats/init"
import { getPresignedGetUrl } from "@/lib/spaces"
import type { ApiResponse } from "@/types"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const app = await db.application.findUnique({
    where: { id },
    include: {
      job: true,
      user: { include: { profile: true } },
    },
  })

  if (!app) return notFound("Application not found")

  if (app.externalApplicationId !== null) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application already dispatched" },
      { status: 400 }
    )
  }

  const profile = app.user.profile
  if (!profile?.isComplete) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "User profile incomplete" },
      { status: 400 }
    )
  }

  // Resolve resume: DB bytes first, then DO Spaces presigned URL
  let resumeBuffer: Buffer | undefined
  if (profile.resumeData) {
    resumeBuffer = Buffer.from(profile.resumeData)
  } else if (profile.resumeUrl) {
    try {
      const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1]
      const presignedUrl = key ? await getPresignedGetUrl(key, 300) : null
      if (presignedUrl) {
        const res = await fetch(presignedUrl)
        if (res.ok) resumeBuffer = Buffer.from(await res.arrayBuffer())
      }
    } catch {
      // Non-fatal: proceed without resume if fetch fails
    }
  }

  // Use the application's tracking email so recruiter replies route correctly
  const trackingEmail = app.trackingEmail ?? profile.email

  initializeAtsProviders()
  const provider = app.job.provider ?? "GREENHOUSE"
  const strategy = getApplyStrategy(provider)
  const applyResult = await strategy.apply({
    boardToken: app.job.boardToken,
    jobExternalId: app.job.externalId,
    // Prefer dedicated applyUrl (rewritten to live custom-domain page for
    // Ashby self-hosters); fall back to absoluteUrl for legacy rows; final
    // fallback is the canonical hosted URL pattern per provider.
    applyUrl: app.job.applyUrl ?? app.job.absoluteUrl ?? (provider === "ASHBY"
      ? `https://jobs.ashbyhq.com/${app.job.boardToken}/${app.job.externalId}/application`
      : `https://boards.greenhouse.io/${app.job.boardToken}/jobs/${app.job.externalId}`),
    profile: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      location: profile.locationFormatted ?? profile.location ?? null,
      linkedInUrl: profile.linkedinUrl ?? null,
      githubUrl: profile.githubUrl ?? null,
      websiteUrl: profile.portfolioUrl ?? null,
      preferredFirstName: profile.preferredFirstName,
    },
    trackingEmail,
    resumeBuffer,
    resumeFileName: profile.resumeFileName ?? "resume.pdf",
  })

  if (applyResult.success && applyResult.applicationId) {
    await db.$transaction([
      db.application.update({
        where: { id: app.id },
        data: {
          externalApplicationId: applyResult.applicationId,
          submissionStatus: "SUBMITTED",
          submissionError: null,
        },
      }),
      db.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: app.status,
          toStatus: app.status,
          reason: "Admin retry dispatch succeeded",
          triggeredBy: `admin:${session.user.email}`,
        },
      }),
    ])

    return NextResponse.json<ApiResponse<{ externalApplicationId: string }>>({
      success: true,
      data: { externalApplicationId: applyResult.applicationId },
    })
  }

  // Dispatch failed — log history entry
  const failReason = applyResult.errorCode === "CAPTCHA_REQUIRED"
    ? `CAPTCHA_REQUIRED: Bot challenge blocked automation. Manual apply: ${applyResult.manualApplyUrl ?? "N/A"}`
    : `Admin retry dispatch failed: ${applyResult.error ?? "Unknown error"}`

  await db.$transaction([
    db.application.update({
      where: { id: app.id },
      data: {
        submissionStatus: "FAILED",
        submissionError: failReason,
      },
    }),
    db.applicationStatusHistory.create({
      data: {
        applicationId: app.id,
        fromStatus: app.status,
        toStatus: app.status,
        reason: failReason,
        triggeredBy: `admin:${session.user.email}`,
      },
    }),
  ])

  return NextResponse.json<ApiResponse<{ errorCode?: string; manualApplyUrl?: string }>>(
    {
      success: false,
      error: `${provider} dispatch failed: ${applyResult.error ?? "Unknown error"}`,
      data: {
        errorCode: applyResult.errorCode,
        manualApplyUrl: applyResult.manualApplyUrl,
      },
    },
    { status: 502 }
  )
}
