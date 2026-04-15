import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession, badRequest } from "../_helpers"
import { paginationSchema } from "@/lib/validations/admin"
import { z } from "zod"
import type { ApiResponse } from "@/types"
import type { AdminUser } from "@/types/admin"

const usersQuerySchema = paginationSchema.extend({
  role: z.enum(["USER", "ADMIN"]).optional(),
  subscriptionStatus: z.enum(["FREE", "ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
})

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = usersQuerySchema.safeParse(params)
  if (!parsed.success) return badRequest(parsed.error.message)

  const { page, limit, search, role, subscriptionStatus } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
    ...(subscriptionStatus ? { subscriptionStatus } : {}),
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionStatus: true,
        creditsUsed: true,
        creditWindowStart: true,
        createdAt: true,
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.user.count({ where }),
  ])

  return NextResponse.json<ApiResponse<AdminUser[]>>({
    success: true,
    data: users as AdminUser[],
    meta: { total, page, limit },
  })
}
