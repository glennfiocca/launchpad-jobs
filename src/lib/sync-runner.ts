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

export class SyncAlreadyRunningError extends Error {
  constructor(public readonly runningSyncLogId: string) {
    super(`Sync already running (syncLogId: ${runningSyncLogId})`)
    this.name = "SyncAlreadyRunningError"
  }
}

export async function runSync(triggeredBy: string): Promise<SyncRunResult> {
  // Concurrency guard — throws before any DB write if already running
  const existingRun = await db.syncLog.findFirst({
    where: { status: "RUNNING" },
    select: { id: true },
  })
  if (existingRun) throw new SyncAlreadyRunningError(existingRun.id)

  const startedAt = new Date()
  const syncLog = await db.syncLog.create({
    data: { triggeredBy, startedAt, status: "RUNNING" },
  })

  let boards: Awaited<ReturnType<typeof getActiveBoards>> = []
  let totalAdded = 0
  let totalUpdated = 0
  let totalDeactivated = 0
  let totalApplicationsUpdated = 0
  let boardsSynced = 0
  let boardsFailed = 0
  const errorSummaries: string[] = []

  try {
    boards = await getActiveBoards()

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
  } catch (err) {
    const completedAt = new Date()
    const errMsg = err instanceof Error ? err.message : String(err)
    try {
      await db.syncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt,
          status: "FAILURE",
          totalBoards: boards.length,
          boardsSynced,
          boardsFailed: boardsFailed + (boards.length - boardsSynced - boardsFailed),
          durationMs: completedAt.getTime() - startedAt.getTime(),
          errorSummary: `Fatal error: ${errMsg}`,
        },
      })
    } catch (updateErr) {
      console.error("[sync-runner] Failed to update SyncLog on fatal error:", updateErr)
    }
    throw err
  }
}

// Default: 4 hours. Operators can tune via SYNC_STALE_THRESHOLD_MS env var.
const DEFAULT_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000

export async function reconcileStaleRuns(
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMs)
  const staleRuns = await db.syncLog.findMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    select: { id: true },
  })
  if (staleRuns.length === 0) return 0

  const thresholdHours = (thresholdMs / 3600000).toFixed(1)
  const reconciledAt = new Date()

  await db.syncLog.updateMany({
    where: { id: { in: staleRuns.map((r) => r.id) } },
    data: {
      status: "FAILURE",
      completedAt: reconciledAt,
      errorSummary: `Marked FAILURE by reconciler at ${reconciledAt.toISOString()}: sync had been RUNNING for >${thresholdHours}h. Probable cause: platform timeout (DO job limit), OOM kill, or process crash. Check DO runtime logs for this time window. Reconcile threshold: ${thresholdMs}ms.`,
    },
  })

  return staleRuns.length
}
