import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, notFound } from "../../../../_helpers"
import { getPresignedGetUrl } from "@/lib/spaces"
import type { ApiResponse } from "@/types"

const PRESIGN_TTL_SECONDS = 900 // 15 minutes — long enough for an operator to open the file

interface DocumentDownloadResponse {
  documentId: string
  applicationId: string
  kind: string
  fileName: string
  mimeType: string
  sizeBytes: number
  url: string
  urlExpiresAt: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id, documentId } = await params

  const document = await db.applicationDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      applicationId: true,
      kind: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      spacesKey: true,
    },
  })

  if (!document) return notFound("Document not found")
  if (document.applicationId !== id) return notFound("Document not found")

  const url = await getPresignedGetUrl(document.spacesKey, PRESIGN_TTL_SECONDS)
  if (!url) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Object storage is not configured" },
      { status: 503 }
    )
  }

  const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString()

  return NextResponse.json<ApiResponse<DocumentDownloadResponse>>({
    success: true,
    data: {
      documentId: document.id,
      applicationId: document.applicationId,
      kind: document.kind,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      url,
      urlExpiresAt: expiresAt,
    },
  })
}
