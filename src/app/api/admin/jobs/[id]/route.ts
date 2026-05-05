import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../_helpers"
import { updateJobSchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await req.json()
  const parsed = updateJobSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { id } = await params

  const job = await db.job.findUnique({ where: { id } })
  if (!job) return notFound("Job not found")

  // Build a partial update so admins can flip either flag independently —
  // useful for fixing classifier misses without touching the active state.
  const data: { isActive?: boolean; isUSEligible?: boolean } = {}
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (parsed.data.isUSEligible !== undefined) data.isUSEligible = parsed.data.isUSEligible

  const updated = await db.job.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      isActive: true,
      isUSEligible: true,
      countryCode: true,
      locationCategory: true,
    },
  })

  return NextResponse.json<ApiResponse<typeof updated>>({ success: true, data: updated })
}
