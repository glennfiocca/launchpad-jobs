import { NextResponse } from "next/server"
import { requireAdminSession } from "../../_helpers"
import { runSync } from "@/lib/sync-runner"
import type { ApiResponse } from "@/types"

export async function POST() {
  const { error, session } = await requireAdminSession()
  if (error) return error

  const triggeredBy = `admin:${session?.user?.email ?? "unknown"}`
  const result = await runSync(triggeredBy)

  return NextResponse.json<ApiResponse<typeof result>>({
    success: true,
    data: result,
    ...(result.boardsFailed > 0 && { error: `${result.boardsFailed} boards failed` }),
  })
}
