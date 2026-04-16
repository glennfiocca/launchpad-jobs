import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdminSession } from "../../_helpers"
import type { ApiResponse } from "@/types"
import type { AdminApplicationStats } from "@/types/admin"

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const now = Date.now()
  const d24h = new Date(now - 24 * 60 * 60 * 1000)
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const [total, dispatched, failedDispatch, last7d, last30d, byStatusRaw, failedDispatchLast24h] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { externalApplicationId: { not: null } } }),
    db.application.count({ where: { externalApplicationId: null, status: { notIn: ["WITHDRAWN"] } } }),
    db.application.count({ where: { appliedAt: { gte: d7 } } }),
    db.application.count({ where: { appliedAt: { gte: d30 } } }),
    db.application.groupBy({ by: ["status"], _count: { status: true } }),
    db.application.count({
      where: {
        externalApplicationId: null,
        status: { notIn: ["WITHDRAWN"] },
        appliedAt: { gte: d24h },
      },
    }),
  ])

  const dispatchRate = dispatched + failedDispatch > 0 ? dispatched / (dispatched + failedDispatch) : 1
  const byStatus = byStatusRaw.map((r) => ({ status: r.status, count: r._count.status }))

  const data: AdminApplicationStats = {
    total,
    dispatched,
    failedDispatch,
    dispatchRate,
    last7d,
    last30d,
    byStatus,
    failedDispatchLast24h,
  }

  return NextResponse.json<ApiResponse<AdminApplicationStats>>({ success: true, data })
}
