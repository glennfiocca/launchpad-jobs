import { NextResponse } from "next/server"
import { requireAdminSession } from "../../_helpers"
import { db } from "@/lib/db"
import type { ApiResponse } from "@/types"
import type { AdminSyncLog } from "@/types/admin"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const log = await db.syncLog.findUnique({
    where: { id },
    include: {
      boardResults: {
        orderBy: { startedAt: "asc" },
      },
    },
  })

  if (!log) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Sync log not found" },
      { status: 404 }
    )
  }

  const data: AdminSyncLog = {
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
    boardResults: log.boardResults.map((r) => ({
      id: r.id,
      boardToken: r.boardToken,
      boardName: r.boardName,
      status: r.status as "SUCCESS" | "FAILURE" | "SKIPPED",
      added: r.added,
      updated: r.updated,
      deactivated: r.deactivated,
      applicationsUpdated: r.applicationsUpdated,
      errors: r.errors,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      durationMs: r.durationMs,
    })),
  }

  return NextResponse.json<ApiResponse<AdminSyncLog>>({ success: true, data })
}
