import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest, notFound } from "../../_helpers"
import { updateCompanyBoardSchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await req.json()
  const parsed = updateCompanyBoardSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { id } = await params

  const board = await db.companyBoard.findUnique({ where: { id } })
  if (!board) return notFound("Company board not found")

  // Enforce boardToken uniqueness if changing it
  if (parsed.data.boardToken && parsed.data.boardToken !== board.boardToken) {
    const duplicate = await db.companyBoard.findUnique({
      where: { boardToken: parsed.data.boardToken },
    })
    if (duplicate) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Board token already in use" },
        { status: 409 }
      )
    }
  }

  const updated = await db.companyBoard.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.boardToken !== undefined ? { boardToken: parsed.data.boardToken } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl || null } : {}),
      ...(parsed.data.website !== undefined ? { website: parsed.data.website || null } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  })

  return NextResponse.json<ApiResponse<typeof updated>>({ success: true, data: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  const board = await db.companyBoard.findUnique({ where: { id } })
  if (!board) return notFound("Company board not found")

  await db.companyBoard.delete({ where: { id } })

  return NextResponse.json<ApiResponse<{ id: string }>>({
    success: true,
    data: { id },
  })
}
