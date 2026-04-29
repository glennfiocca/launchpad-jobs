import { NextResponse } from "next/server"
import { requireAdminSession } from "../../_helpers"
import { acquireSyncLock, executeSyncWork } from "@/lib/sync-runner"
import { initializeAtsProviders } from "@/lib/ats/init"
import type { ApiResponse } from "@/types"

export async function POST() {
  const { error, session } = await requireAdminSession()
  if (error) return error

  initializeAtsProviders()

  const triggeredBy = `admin:${session?.user?.email ?? "unknown"}`
  const lock = await acquireSyncLock(triggeredBy)

  if (!lock.acquired) {
    return NextResponse.json<ApiResponse<{ runningSyncLogId: string }>>(
      { success: false, error: "A sync is already running", data: { runningSyncLogId: lock.runningSyncLogId } },
      { status: 409 },
    )
  }

  // Fire-and-forget: route returns 202, worker runs in background
  executeSyncWork(lock.syncLogId).catch((err) => {
    console.error(
      `[sync] Background worker fatal: syncLogId=${lock.syncLogId} error=${err instanceof Error ? err.message : String(err)}`,
    )
  })

  return NextResponse.json<ApiResponse<{ syncLogId: string; status: string }>>(
    { success: true, data: { syncLogId: lock.syncLogId, status: "RUNNING" } },
    { status: 202 },
  )
}
