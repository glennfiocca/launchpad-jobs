// scripts/sync-cron.ts
// Cron job: calls runSync() directly (Prisma), bypassing the HTTP layer.
// Runs via DigitalOcean scheduled job at 09:00 UTC (04:00 EST / 05:00 EDT).
// Note: DO App Platform cron does not support timezone; adjust manually if DST drift matters.
// Execute with: npx tsx scripts/sync-cron.ts

import { runSync, reconcileStaleRuns, SyncAlreadyRunningError } from "@/lib/sync-runner"

if (!process.env.DATABASE_URL) {
  console.error("[sync-cron] ERROR: DATABASE_URL not set")
  process.exit(1)
}

const staleCount = await reconcileStaleRuns()
if (staleCount > 0) {
  console.warn(`[sync-cron] Reconciled ${staleCount} stale RUNNING sync(s) to FAILURE`)
}

console.log(`[sync-cron] Started at: ${new Date().toISOString()}`)
console.log("[sync-cron] Running sync directly (no HTTP)")

try {
  const result = await runSync("cron")

  console.log(`[sync-cron] SyncLog ID: ${result.syncLogId}`)
  console.log(`[sync-cron] Boards: ${result.boardsSynced}/${result.totalBoards} synced, ${result.boardsFailed} failed`)
  console.log(`[sync-cron] Jobs: +${result.totalAdded} added, ~${result.totalUpdated} updated, -${result.totalDeactivated} deactivated`)
  console.log(`[sync-cron] Applications updated: ${result.totalApplicationsUpdated}`)
  console.log(`[sync-cron] Duration: ${result.durationMs}ms`)
  console.log(`[sync-cron] Status: ${result.status}`)

  if (result.boardsFailed > 0) {
    console.warn(`[sync-cron] WARNING: ${result.boardsFailed} boards failed`)
  }

  console.log(`[sync-cron] Completed at: ${new Date().toISOString()}`)
  process.exit(0)
} catch (err) {
  if (err instanceof SyncAlreadyRunningError) {
    console.log(`[sync-cron] Skipped: another sync is already running (syncLogId: ${err.runningSyncLogId})`)
    process.exit(0)
  }
  console.error(`[sync-cron] FATAL: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
