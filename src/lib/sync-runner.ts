import type { AtsProvider } from "@prisma/client"
import { db } from "@/lib/db"
import { getActiveBoards } from "@/lib/greenhouse/sync"
import { initializeAtsProviders } from "@/lib/ats/init"
import { syncBoard } from "@/lib/ats/sync"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type AcquireLockResult =
  | { acquired: true; syncLogId: string }
  | { acquired: false; runningSyncLogId: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000 // 4 hours

/** Read operator-tunable stale threshold from env, falling back to 4h. */
export function getStaleThresholdMs(): number {
  const raw = process.env.SYNC_STALE_THRESHOLD_MS
  if (!raw) return DEFAULT_STALE_THRESHOLD_MS
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_THRESHOLD_MS
}

// ---------------------------------------------------------------------------
// Reconcile stale RUNNING rows
// ---------------------------------------------------------------------------

/**
 * Mark any SyncLog rows stuck in RUNNING past the threshold as FAILURE.
 * Called automatically inside `acquireSyncLock()` so every entry path
 * (cron, admin, API) benefits from reconciliation.
 */
export async function reconcileStaleRuns(
  thresholdMs?: number,
): Promise<number> {
  const effectiveThreshold = thresholdMs ?? getStaleThresholdMs()
  const cutoff = new Date(Date.now() - effectiveThreshold)

  const staleRuns = await db.syncLog.findMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    select: { id: true },
  })
  if (staleRuns.length === 0) return 0

  const thresholdHours = (effectiveThreshold / 3_600_000).toFixed(1)
  const reconciledAt = new Date()

  await db.syncLog.updateMany({
    where: { id: { in: staleRuns.map((r) => r.id) } },
    data: {
      status: "FAILURE",
      completedAt: reconciledAt,
      errorSummary: `Marked FAILURE by reconciler at ${reconciledAt.toISOString()}: sync had been RUNNING for >${thresholdHours}h. Probable cause: platform timeout (DO job limit), OOM kill, or process crash. Check DO runtime logs for this time window. Reconcile threshold: ${effectiveThreshold}ms.`,
    },
  })

  for (const run of staleRuns) {
    console.warn(
      `[sync] Reconciled stale run: syncLogId=${run.id} reconciledAt=${reconciledAt.toISOString()} thresholdMs=${effectiveThreshold}`,
    )
  }

  return staleRuns.length
}

// ---------------------------------------------------------------------------
// Atomic lock acquisition
// ---------------------------------------------------------------------------

/**
 * Atomically insert a RUNNING SyncLog row if none exists, using a single
 * INSERT ... WHERE NOT EXISTS to close the race window between the old
 * findFirst + create two-query approach.
 */
export async function acquireSyncLock(
  triggeredBy: string,
): Promise<AcquireLockResult> {
  // Reconcile any stale rows first — centralised for every entry path
  await reconcileStaleRuns()

  const id = crypto.randomUUID()
  const now = new Date()

  // Atomic INSERT ... WHERE NOT EXISTS — returns 0 if a RUNNING row exists
  const inserted: number = await db.$executeRaw`
    INSERT INTO "SyncLog" (id, "triggeredBy", "startedAt", status)
    SELECT ${id}, ${triggeredBy}, ${now}::timestamp, 'RUNNING'::"SyncStatus"
    WHERE NOT EXISTS (
      SELECT 1 FROM "SyncLog" WHERE status = 'RUNNING'::"SyncStatus"
    )
  `

  if (inserted === 0) {
    const blocking = await db.syncLog.findFirst({
      where: { status: "RUNNING" },
      select: { id: true },
    })
    const runningSyncLogId = blocking?.id ?? "unknown"
    console.warn(
      `[sync] Lock rejected: triggeredBy=${triggeredBy} blockedBy=${runningSyncLogId}`,
    )
    return { acquired: false, runningSyncLogId }
  }

  console.log(
    `[sync] Lock acquired: syncLogId=${id} triggeredBy=${triggeredBy}`,
  )
  return { acquired: true, syncLogId: id }
}

// ---------------------------------------------------------------------------
// Core sync work
// ---------------------------------------------------------------------------

/**
 * Execute the actual board-by-board sync. Expects `syncLogId` to reference
 * an existing RUNNING SyncLog row (created by `acquireSyncLock`).
 */
export async function executeSyncWork(
  syncLogId: string,
): Promise<SyncRunResult> {
  // Ensure all ATS providers are registered before syncing
  initializeAtsProviders()

  const syncLog = await db.syncLog.findUniqueOrThrow({
    where: { id: syncLogId },
    select: { startedAt: true },
  })
  const startedAt = syncLog.startedAt

  interface BoardEntry {
    token: string
    name: string
    provider: AtsProvider
    logoUrl?: string
  }

  let boards: BoardEntry[] = []
  let totalAdded = 0
  let totalUpdated = 0
  let totalDeactivated = 0
  let totalApplicationsUpdated = 0
  let boardsSynced = 0
  let boardsFailed = 0
  const errorSummaries: string[] = []

  try {
    // Load all active boards from CompanyBoard (multi-provider)
    const dbBoards = await db.companyBoard.findMany({
      where: { isActive: true },
      select: { boardToken: true, name: true, provider: true, logoUrl: true },
    })

    boards = dbBoards.map((b) => ({
      token: b.boardToken,
      name: b.name,
      provider: b.provider,
      ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    }))

    // Fallback: if no Greenhouse boards in DB, use SEED_BOARDS via getActiveBoards()
    const hasGreenhouseFromDb = boards.some((b) => b.provider === "GREENHOUSE")
    if (!hasGreenhouseFromDb) {
      const seedBoards = await getActiveBoards()
      const seedEntries: BoardEntry[] = seedBoards.map((b) => ({
        token: b.token,
        name: b.name,
        provider: "GREENHOUSE" as AtsProvider,
        ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
      }))
      boards = [...boards, ...seedEntries]
    }

    console.log(
      `[sync] Boards fetched: syncLogId=${syncLogId} count=${boards.length}`,
    )

    for (const board of boards) {
      const boardStart = new Date()
      try {
        const result = await syncBoard(board.provider, board.token, board.name, board.logoUrl)
        const boardEnd = new Date()
        const boardDuration = boardEnd.getTime() - boardStart.getTime()

        const hasErrors = result.errors.length > 0
        await db.syncBoardResult.create({
          data: {
            syncLogId,
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
          console.warn(
            `[sync] Board failed: syncLogId=${syncLogId} board=${board.name} provider=${board.provider} errors=${result.errors.length} durationMs=${boardDuration}`,
          )
        } else {
          boardsSynced++
          console.log(
            `[sync] Board synced: syncLogId=${syncLogId} board=${board.name} provider=${board.provider} added=${result.jobsAdded} updated=${result.jobsUpdated} deactivated=${result.jobsDeactivated} durationMs=${boardDuration}`,
          )
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
            syncLogId,
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
        console.error(
          `[sync] Board exception: syncLogId=${syncLogId} board=${board.name} provider=${board.provider} error=${errMsg}`,
        )
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
      where: { id: syncLogId },
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

    console.log(
      `[sync] Completed: syncLogId=${syncLogId} status=${status} boards=${boardsSynced}/${boards.length} durationMs=${durationMs}`,
    )

    return {
      syncLogId,
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
    console.error(
      `[sync] Fatal error: syncLogId=${syncLogId} error=${errMsg}`,
    )
    try {
      await db.syncLog.update({
        where: { id: syncLogId },
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
      console.error(
        `[sync] Failed to update SyncLog on fatal error: syncLogId=${syncLogId} error=${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Acquire the lock and execute sync in one call. Throws
 * `SyncAlreadyRunningError` if another sync is in progress.
 */
export async function runSync(triggeredBy: string): Promise<SyncRunResult> {
  const lock = await acquireSyncLock(triggeredBy)
  if (!lock.acquired) throw new SyncAlreadyRunningError(lock.runningSyncLogId)
  return executeSyncWork(lock.syncLogId)
}
