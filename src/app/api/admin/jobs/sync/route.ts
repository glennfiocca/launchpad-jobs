import { NextResponse } from "next/server"
import { requireAdminSession } from "../../_helpers"
import { runSync, SyncAlreadyRunningError } from "@/lib/sync-runner"
import type { ApiResponse } from "@/types"

export async function POST() {
  const { error, session } = await requireAdminSession()
  if (error) return error

  const triggeredBy = `admin:${session?.user?.email ?? "unknown"}`

  try {
    const result = await runSync(triggeredBy)
    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      ...(result.boardsFailed > 0 && { error: `${result.boardsFailed} boards failed` }),
    })
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      return NextResponse.json<ApiResponse<{ runningSyncLogId: string }>>(
        { success: false, error: "A sync is already running", data: { runningSyncLogId: err.runningSyncLogId } },
        { status: 409 }
      )
    }
    throw err
  }
}
