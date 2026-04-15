import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession } from "../_helpers"
import type { ApiResponse } from "@/types"
import type { AdminStats } from "@/types/admin"

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    newSignups30d,
    totalApplications,
    applications30d,
    applicationsByStatus,
    subscriptionsByStatus,
    activeJobs,
    activeBoards,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    db.application.count(),
    db.application.count({ where: { appliedAt: { gte: thirtyDaysAgo } } }),
    db.application.groupBy({ by: ["status"], _count: { status: true } }),
    db.user.groupBy({ by: ["subscriptionStatus"], _count: { subscriptionStatus: true } }),
    db.job.count({ where: { isActive: true } }),
    db.companyBoard.count({ where: { isActive: true } }),
  ])

  const data: AdminStats = {
    totalUsers,
    newSignups30d,
    totalApplications,
    applications30d,
    activeJobs,
    activeBoards,
    applicationsByStatus: applicationsByStatus.map((r) => ({
      status: r.status,
      count: r._count.status,
    })),
    subscriptionsByStatus: subscriptionsByStatus.map((r) => ({
      status: r.subscriptionStatus,
      count: r._count.subscriptionStatus,
    })),
  }

  return NextResponse.json<ApiResponse<AdminStats>>({ success: true, data })
}
