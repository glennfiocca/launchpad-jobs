import { NextResponse } from "next/server"
import { requireAdminSession } from "../_helpers"
import { db } from "@/lib/db"
import type { ApiResponse } from "@/types"
import type { AdminSyncLog } from "@/types/admin"

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const status = searchParams.get("status") ?? undefined

  const where = status ? { status: status as any } : {}

  const [total, logs] = await Promise.all([
    db.syncLog.count({ where }),
    db.syncLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      // Don't include boardResults in list view — too heavy
    }),
  ])

  const data: AdminSyncLog[] = logs.map((log) => ({
    id: log.id,
    triggeredBy: log.triggeredBy,
    startedAt: log.startedAt.toISOString(),
    completedAt: log.completedAt?.toISOString() ?? null,
    status: log.status as AdminSyncLog["status"],
    totalBoards: log.totalBoards,
    boardsSynced: log.boardsSynced,
    boardsFailed: log.boardsFailed,
    totalAdded: log.totalAdded,
    totalUpdated: log.totalUpdated,
    totalDeactivated: log.totalDeactivated,
    totalApplicationsUpdated: log.totalApplicationsUpdated,
    durationMs: log.durationMs,
    errorSummary: log.errorSummary,
  }))

  return NextResponse.json<ApiResponse<AdminSyncLog[]>>({
    success: true,
    data,
    meta: { total, page, limit },
  })
}
