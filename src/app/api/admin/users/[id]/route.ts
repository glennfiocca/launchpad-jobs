import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../_helpers"
import { updateUserSchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const body = await req.json()
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { role, resetCredits } = parsed.data
  const { id: targetId } = await params

  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) return notFound("User not found")

  // Prevent self-demotion if last admin
  if (role === "USER" && session.user.id === targetId) {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } })
    if (adminCount <= 1) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Cannot demote the last admin" },
        { status: 409 }
      )
    }
  }

  const updated = await db.user.update({
    where: { id: targetId },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(resetCredits ? { creditsUsed: 0, creditWindowStart: new Date() } : {}),
    },
    select: { id: true, email: true, role: true, creditsUsed: true },
  })

  return NextResponse.json<ApiResponse<typeof updated>>({ success: true, data: updated })
}
