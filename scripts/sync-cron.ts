// scripts/sync-cron.ts
// Cron job: calls runSync() directly (Prisma), bypassing the HTTP layer.
// Runs via DigitalOcean scheduled job at 09:00 UTC (04:00 EST / 05:00 EDT).
// Stale RUNNING reconciliation is centralized in acquireSyncLock().
// Execute with: npx tsx scripts/sync-cron.ts

// Sentry: Next.js auto-instrumentation does NOT apply to standalone tsx
// scripts, so we explicitly init here. No-op when SENTRY_DSN is unset
// (e.g. local dev), mirroring sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs"
import { createLogger } from "@/lib/logger"

const log = createLogger({ component: "sync", entry: "cron" })

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
    log.error("DATABASE_URL not set")
    process.exit(1)
  }

  log.info("Started", {
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    cwd: process.cwd(),
  })
  log.info("Importing sync-runner")

  const { runSync } = await import("@/lib/sync-runner")

  log.info("Import successful, running sync directly (no HTTP)")

  await ping("/start")
  const result = await runSync("cron")
  // Treat full FAILURE as /fail; SUCCESS and PARTIAL_FAILURE both count as a
  // completed run from the heartbeat's perspective (some boards ran).
  await ping(result.status === "FAILURE" ? "/fail" : "")

  const runLog = log.child({ syncLogId: result.syncLogId })
  runLog.info("Run summary", {
    boardsSynced: result.boardsSynced,
    totalBoards: result.totalBoards,
    boardsFailed: result.boardsFailed,
    added: result.totalAdded,
    updated: result.totalUpdated,
    deactivated: result.totalDeactivated,
    applicationsUpdated: result.totalApplicationsUpdated,
    durationMs: result.durationMs,
    status: result.status,
  })

  if (result.boardsFailed > 0) {
    runLog.warn("Some boards failed", { boardsFailed: result.boardsFailed })
  }

  runLog.info("Completed", { completedAt: new Date().toISOString() })
  process.exit(0)
}

main().catch(async (err) => {
  if (err && typeof err === "object" && "name" in err && err.name === "SyncAlreadyRunningError") {
    const runningSyncLogId =
      "runningSyncLogId" in err && typeof err.runningSyncLogId === "string"
        ? err.runningSyncLogId
        : "unknown"
    log.info("Skipped: another sync is already running", { runningSyncLogId })
    // Lock contention is not an outage — emit a normal heartbeat so
    // Healthchecks doesn't fire a false alert.
    await ping("")
    process.exit(0)
  }
  // Top-level crash before runSync produced a result — signal /fail so
  // Healthchecks alerts even if runSync itself never returned.
  await ping("/fail")
  log.error("FATAL", {
    error: err instanceof Error ? err.stack ?? err.message : String(err),
  })
  process.exit(1)
})
