import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../_helpers"
import { createCompanyBoardSchema } from "@/lib/validations/admin"
import type { ApiResponse } from "@/types"
import type { AdminCompanyBoard } from "@/types/admin"

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const boards = await db.companyBoard.findMany({
    orderBy: { name: "asc" },
  })

  // Count active jobs per board token (board.boardToken matches company.slug)
  const jobCounts = await db.company.findMany({
    where: { slug: { in: boards.map((b) => b.boardToken) } },
    select: { slug: true, _count: { select: { jobs: true } } },
  })
  const countMap = new Map(jobCounts.map((c) => [c.slug, c._count.jobs]))

  const data: AdminCompanyBoard[] = boards.map((b) => ({
    ...b,
    jobCount: countMap.get(b.boardToken) ?? 0,
  }))

  return NextResponse.json<ApiResponse<AdminCompanyBoard[]>>({ success: true, data })
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await req.json()
  const parsed = createCompanyBoardSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const provider = parsed.data.provider ?? "GREENHOUSE"

  const existing = await db.companyBoard.findUnique({
    where: { provider_boardToken: { provider, boardToken: parsed.data.boardToken } },
  })
  if (existing) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "A board with this token already exists for this provider" },
      { status: 409 }
    )
  }

  const board = await db.companyBoard.create({
    data: {
      name: parsed.data.name,
      boardToken: parsed.data.boardToken,
      provider,
      logoUrl: parsed.data.logoUrl || null,
      website: parsed.data.website || null,
    },
  })

  return NextResponse.json<ApiResponse<typeof board>>({ success: true, data: board }, { status: 201 })
}
