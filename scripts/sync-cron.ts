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

// Healthchecks.io heartbeat. Track C.3. The URL is write-only — leakage only
// allows ping-spoofing, not data access — so it's a plain env var, not a
// SECRET. Pings are best-effort: failures must NOT break the sync run.
const HEALTHCHECKS_URL = process.env.HEALTHCHECKS_URL

type HeartbeatSuffix = "" | "/start" | "/fail"

async function ping(suffix: HeartbeatSuffix = ""): Promise<void> {
  if (!HEALTHCHECKS_URL) return
  try {
    await fetch(`${HEALTHCHECKS_URL}${suffix}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    // Heartbeat is observability — never let it propagate.
    console.warn("[heartbeat] ping failed:", err)
  }
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

  await ping("/start")
  const result = await runSync("cron")
  // Treat full FAILURE as /fail; SUCCESS and PARTIAL_FAILURE both count as a
  // completed run from the heartbeat's perspective (some boards ran).
  await ping(result.status === "FAILURE" ? "/fail" : "")

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

main().catch(async (err) => {
  if (err && typeof err === "object" && "name" in err && err.name === "SyncAlreadyRunningError") {
    const runningSyncLogId = "runningSyncLogId" in err ? err.runningSyncLogId : "unknown"
    console.log(`[sync-cron] Skipped: another sync is already running (syncLogId: ${runningSyncLogId})`)
    // Lock contention is not an outage — emit a normal heartbeat so
    // Healthchecks doesn't fire a false alert.
    await ping("")
    process.exit(0)
  }
  // Top-level crash before runSync produced a result — signal /fail so
  // Healthchecks alerts even if runSync itself never returned.
  await ping("/fail")
  console.error(`[sync-cron] FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exit(1)
})
