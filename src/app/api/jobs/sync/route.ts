import { NextResponse } from "next/server"
import { runSync } from "@/lib/sync-runner"
import type { ApiResponse } from "@/types"

// Protected by a secret token for cron jobs
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const result = await runSync("cron")
  return NextResponse.json<ApiResponse<typeof result>>({
    success: true,
    data: result,
    ...(result.boardsFailed > 0 && { error: `${result.boardsFailed} boards failed` }),
  })
}
