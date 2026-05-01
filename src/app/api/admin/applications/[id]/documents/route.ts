import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound } from "../../../_helpers"
import { generateAndAttachOperatorSummary } from "@/lib/pdf/generate-and-attach-summary"
import { OPERATOR_SUMMARY_KIND } from "@/lib/pdf/application-summary-data"
import type { ApiResponse } from "@/types"

// Throttle to prevent admins from spamming uploads / PDF renders for the
// same application. Re-render only allowed every N seconds per (app, kind).
const REGENERATE_THROTTLE_SECONDS = 10

interface RegenerateBody {
  kind?: string
}

interface RegenerateResponse {
  documentId: string
  fileName: string
  sizeBytes: number
  regenerated: boolean
}

/**
 * Force regeneration of an application's operator-queue summary PDF.
 * Idempotent — overwrites the existing object/row in place.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  let body: RegenerateBody = {}
  try {
    body = (await req.json().catch(() => ({}))) as RegenerateBody
  } catch {
    body = {}
  }
  const kind = body.kind ?? OPERATOR_SUMMARY_KIND
  if (kind !== OPERATOR_SUMMARY_KIND) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Unknown document kind: ${kind}` },
      { status: 400 }
    )
  }

  const app = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      applicationSnapshot: true,
      job: { select: { title: true, absoluteUrl: true, company: { select: { name: true } } } },
    },
  })
  if (!app) return notFound("Application not found")
  if (!app.applicationSnapshot) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application has no snapshot to summarize" },
      { status: 400 }
    )
  }

  // Throttle: reject if last update is too recent.
  const existing = await db.applicationDocument.findUnique({
    where: { applicationId_kind: { applicationId: id, kind } },
    select: { updatedAt: true },
  })
  if (existing) {
    const ageMs = Date.now() - existing.updatedAt.getTime()
    if (ageMs < REGENERATE_THROTTLE_SECONDS * 1000) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: `Wait ${Math.ceil((REGENERATE_THROTTLE_SECONDS * 1000 - ageMs) / 1000)}s before regenerating.`,
        },
        { status: 429 }
      )
    }
  }

  try {
    const result = await generateAndAttachOperatorSummary({
      applicationId: id,
      jobTitle: app.job.title,
      companyName: app.job.company.name,
      applyUrl: app.job.absoluteUrl,
      snapshot: app.applicationSnapshot as Record<string, unknown>,
      actorUserId: session.user.id,
    })

    return NextResponse.json<ApiResponse<RegenerateResponse>>({
      success: true,
      data: {
        documentId: result.documentId,
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        regenerated: result.regenerated,
      },
    })
  } catch (err) {
    console.error("[admin] regenerate summary PDF failed:", err)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to regenerate summary PDF" },
      { status: 500 }
    )
  }
}
