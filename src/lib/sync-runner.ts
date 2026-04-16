import { db } from "@/lib/db"
import { getActiveBoards, syncGreenhouseBoard } from "@/lib/greenhouse"

export interface SyncRunResult {
  syncLogId: string
  totalBoards: number
  boardsSynced: number
  boardsFailed: number
  totalAdded: number
  totalUpdated: number
  totalDeactivated: number
  totalApplicationsUpdated: number
  durationMs: number
  status: "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE"
}

export async function runSync(triggeredBy: string): Promise<SyncRunResult> {
  const startedAt = new Date()

  // Create the SyncLog record in RUNNING state
  const syncLog = await db.syncLog.create({
    data: { triggeredBy, startedAt, status: "RUNNING" },
  })

  const boards = await getActiveBoards()

  let totalAdded = 0
  let totalUpdated = 0
  let totalDeactivated = 0
  let totalApplicationsUpdated = 0
  let boardsSynced = 0
  let boardsFailed = 0
  const errorSummaries: string[] = []

  for (const board of boards) {
    const boardStart = new Date()
    try {
      const result = await syncGreenhouseBoard(board.token, board.name, board.logoUrl)
      const boardEnd = new Date()
      const boardDuration = boardEnd.getTime() - boardStart.getTime()

      const hasErrors = result.errors.length > 0
      await db.syncBoardResult.create({
        data: {
          syncLogId: syncLog.id,
          boardToken: board.token,
          boardName: board.name,
          status: hasErrors ? "FAILURE" : "SUCCESS",
          added: result.jobsAdded,
          updated: result.jobsUpdated,
          deactivated: result.jobsDeactivated,
          applicationsUpdated: result.applicationsUpdated,
          errors: result.errors,
          startedAt: boardStart,
          completedAt: boardEnd,
          durationMs: boardDuration,
        },
      })

      if (hasErrors) {
        boardsFailed++
        errorSummaries.push(`${board.name}: ${result.errors.join("; ")}`)
      } else {
        boardsSynced++
      }

      totalAdded += result.jobsAdded
      totalUpdated += result.jobsUpdated
      totalDeactivated += result.jobsDeactivated
      totalApplicationsUpdated += result.applicationsUpdated
    } catch (err) {
      const boardEnd = new Date()
      const errMsg = err instanceof Error ? err.message : String(err)
      await db.syncBoardResult.create({
        data: {
          syncLogId: syncLog.id,
          boardToken: board.token,
          boardName: board.name,
          status: "FAILURE",
          errors: [errMsg],
          startedAt: boardStart,
          completedAt: boardEnd,
          durationMs: boardEnd.getTime() - boardStart.getTime(),
        },
      })
      boardsFailed++
      errorSummaries.push(`${board.name}: ${errMsg}`)
    }
  }

  const completedAt = new Date()
  const durationMs = completedAt.getTime() - startedAt.getTime()

  let status: "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE"
  if (boardsFailed === 0) {
    status = "SUCCESS"
  } else if (boardsSynced > 0) {
    status = "PARTIAL_FAILURE"
  } else {
    status = "FAILURE"
  }

  await db.syncLog.update({
    where: { id: syncLog.id },
    data: {
      completedAt,
      status,
      totalBoards: boards.length,
      boardsSynced,
      boardsFailed,
      totalAdded,
      totalUpdated,
      totalDeactivated,
      totalApplicationsUpdated,
      durationMs,
      errorSummary: errorSummaries.length > 0 ? errorSummaries.join("\n") : null,
    },
  })

  return {
    syncLogId: syncLog.id,
    totalBoards: boards.length,
    boardsSynced,
    boardsFailed,
    totalAdded,
    totalUpdated,
    totalDeactivated,
    totalApplicationsUpdated,
    durationMs,
    status,
  }
}
