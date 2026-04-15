import { NextResponse } from "next/server"
import { requireAdminSession } from "../../_helpers"
import { getActiveBoards, syncGreenhouseBoard } from "@/lib/greenhouse"
import type { ApiResponse } from "@/types"

interface SyncBoardResult {
  name: string
  success: boolean
  error?: string
}

interface SyncSummary {
  synced: number
  failed: number
  total: number
  results: SyncBoardResult[]
  message?: string
}

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const boards = await getActiveBoards()
  if (boards.length === 0) {
    return NextResponse.json<ApiResponse<SyncSummary>>({
      success: true,
      data: { synced: 0, failed: 0, total: 0, results: [], message: "No active boards" },
    })
  }

  const results: SyncBoardResult[] = []

  for (const board of boards) {
    try {
      await syncGreenhouseBoard(board.token, board.name, board.logoUrl)
      results.push({ name: board.name, success: true })
    } catch (err) {
      results.push({
        name: board.name,
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const synced = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return NextResponse.json<ApiResponse<SyncSummary>>({
    success: true,
    data: { synced, failed, total: boards.length, results },
  })
}
