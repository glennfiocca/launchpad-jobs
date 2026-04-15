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

  const updated = await db.job.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, title: true, isActive: true },
  })

  return NextResponse.json<ApiResponse<typeof updated>>({ success: true, data: updated })
}
