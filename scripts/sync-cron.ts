// scripts/sync-cron.ts
// Cron job: calls runSync() directly (Prisma), bypassing the HTTP layer.
// Runs via DigitalOcean scheduled job at 09:00 UTC (04:00 EST / 05:00 EDT).
// Stale RUNNING reconciliation is centralized in acquireSyncLock().
// Execute with: npx tsx scripts/sync-cron.ts

// Sentry: Next.js auto-instrumentation does NOT apply to standalone tsx
// scripts, so we explicitly init here. No-op when SENTRY_DSN is unset
// (e.g. local dev), mirroring sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs"

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_SHA,
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[sync-cron] ERROR: DATABASE_URL not set")
    process.exit(1)
  }

  console.log(`[sync-cron] Started at: ${new Date().toISOString()}`)
  console.log(`[sync-cron] Node version: ${process.version}`)
  console.log(`[sync-cron] Working directory: ${process.cwd()}`)
  console.log("[sync-cron] Importing sync-runner...")

  const { runSync } = await import("@/lib/sync-runner")

  console.log("[sync-cron] Import successful, running sync directly (no HTTP)")

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
}

main().catch((err) => {
  if (err && typeof err === "object" && "name" in err && err.name === "SyncAlreadyRunningError") {
    const runningSyncLogId = "runningSyncLogId" in err ? err.runningSyncLogId : "unknown"
    console.log(`[sync-cron] Skipped: another sync is already running (syncLogId: ${runningSyncLogId})`)
    process.exit(0)
  }
  console.error(`[sync-cron] FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exit(1)
})
