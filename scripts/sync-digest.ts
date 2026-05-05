// scripts/sync-digest.ts
// Track C.4 — daily 09:00 UTC admin digest email.
//
// Queries SyncLog rows from the last 24h, aggregates totals + per-board
// failure samples, and emails every User WHERE role = 'ADMIN' via Resend.
//
// Usage:
//   npx tsx scripts/sync-digest.ts
//
// Sends EVERY day, even when zero runs landed — a "no syncs ran" banner is
// rendered in that case (silent-failure signal). Per HARDENING_PLAN.md C.4.4.
//
// Top-level errors are captured to Sentry (DSN set in .do/app.yaml) and the
// script exits non-zero so DO surfaces the failure. The Resend send itself
// is wrapped in a 30s timeout to avoid hanging the cron.

import "dotenv/config"
import * as Sentry from "@sentry/nextjs"
import { db } from "@/lib/db"
import { sendSyncDigest } from "@/lib/email"
import type { SyncDigestData, SyncDigestFailureRow } from "@/lib/email-templates"

// Hard cap on Resend send. Cron timeout is 300s (see app.yaml) so a 30s
// network deadline is plenty of margin.
const RESEND_TIMEOUT_MS = 30_000
// Cap how many board-level failure rows we render. Anything beyond is
// elided — the admin can drill into the dashboard for the full list.
const FAILURE_SAMPLE_LIMIT = 10
// 24h aggregation window.
const WINDOW_MS = 24 * 60 * 60 * 1000

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_SHA,
  })
}

if (!process.env.DATABASE_URL) {
  console.error("[sync-digest] ERROR: DATABASE_URL not set")
  process.exit(1)
}

if (!process.env.RESEND_API_KEY) {
  console.error("[sync-digest] ERROR: RESEND_API_KEY not set")
  process.exit(1)
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai"
const ADMIN_DASHBOARD_URL = `${APP_URL}/admin/sync`

// --------------------------------------------------------------------------
// Resolve the digest "for" date — yesterday in UTC. The digest fires at
// 09:00 UTC and reports on the prior calendar day's tail of syncs (midnight
// → midnight is roughly the right window, but we use a flat -24h span to
// keep the math simple; the email body shows the exact window).
// --------------------------------------------------------------------------
const windowEnd = new Date()
const windowStart = new Date(windowEnd.getTime() - WINDOW_MS)
const reportDate = new Date(windowEnd.getTime() - WINDOW_MS / 2)
  .toISOString()
  .slice(0, 10)

console.log(
  `[sync-digest] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()} (reportDate=${reportDate})`,
)

// --------------------------------------------------------------------------
// Aggregate SyncLog rows for the window.
// --------------------------------------------------------------------------
const runs = await db.syncLog.findMany({
  where: { startedAt: { gte: windowStart, lt: windowEnd } },
  orderBy: { startedAt: "desc" },
  include: {
    boardResults: {
      where: { status: "FAILURE" },
      orderBy: { startedAt: "desc" },
      take: FAILURE_SAMPLE_LIMIT,
    },
  },
})

let successes = 0
let partialFailures = 0
let failures = 0
let totalAdded = 0
let totalUpdated = 0
let totalDeactivated = 0
const durations: number[] = []
const failureSamples: SyncDigestFailureRow[] = []

for (const run of runs) {
  if (run.status === "SUCCESS") successes += 1
  else if (run.status === "PARTIAL_FAILURE") partialFailures += 1
  else if (run.status === "FAILURE") failures += 1

  totalAdded += run.totalAdded
  totalUpdated += run.totalUpdated
  totalDeactivated += run.totalDeactivated
  if (run.durationMs !== null && run.durationMs !== undefined) {
    durations.push(run.durationMs)
  }

  // Pull up to FAILURE_SAMPLE_LIMIT board failure rows across the whole
  // window. We dedupe on boardToken so a single broken board doesn't fill
  // the email with 50 copies of the same error.
  for (const board of run.boardResults) {
    if (failureSamples.length >= FAILURE_SAMPLE_LIMIT) break
    if (failureSamples.some((s) => s.boardToken === board.boardToken)) continue
    failureSamples.push({
      boardToken: board.boardToken,
      boardName: board.boardName,
      errors: board.errors,
      startedAt: board.startedAt,
    })
  }
}

const averageDurationMs =
  durations.length > 0
    ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
    : null

const digestData: SyncDigestData = {
  reportDate,
  windowStart,
  windowEnd,
  totalRuns: runs.length,
  successes,
  partialFailures,
  failures,
  totalAdded,
  totalUpdated,
  totalDeactivated,
  averageDurationMs,
  failureSamples,
  adminDashboardUrl: ADMIN_DASHBOARD_URL,
}

console.log(
  `[sync-digest] Aggregated: runs=${runs.length} ok=${successes} partial=${partialFailures} failed=${failures} added=${totalAdded} updated=${totalUpdated} deactivated=${totalDeactivated}`,
)

// --------------------------------------------------------------------------
// Resolve admin recipients.
// --------------------------------------------------------------------------
const admins = await db.user.findMany({
  where: { role: "ADMIN", email: { not: null }, deletedAt: null },
  select: { email: true, name: true },
})

const recipients = admins
  .map((a) => a.email)
  .filter((email): email is string => typeof email === "string" && email.length > 0)

if (recipients.length === 0) {
  console.warn("[sync-digest] No admin recipients found — skipping send.")
  process.exit(0)
}

console.log(`[sync-digest] Recipients: ${recipients.length} admin(s)`)

// --------------------------------------------------------------------------
// Send via Resend with a 30s timeout — never let a slow Resend response
// keep the DO scheduled job alive past its budget.
// --------------------------------------------------------------------------
const sendPromise = sendSyncDigest({ to: recipients, data: digestData })
const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
  setTimeout(
    () => resolve({ ok: false, error: `resend send exceeded ${RESEND_TIMEOUT_MS}ms` }),
    RESEND_TIMEOUT_MS,
  )
})

const sendResult = await Promise.race([sendPromise, timeoutPromise])

if (!sendResult.ok) {
  const errMsg = sendResult.error ?? "unknown send failure"
  console.error(`[sync-digest] Resend FAILED: ${errMsg}`)
  Sentry.captureException(new Error(`sync-digest Resend failure: ${errMsg}`), {
    tags: { component: "sync-digest" },
    extra: {
      reportDate,
      runs: runs.length,
      recipients: recipients.length,
    },
  })
  await Sentry.flush(2_000).catch(() => undefined)
  process.exit(1)
}

console.log(`[sync-digest] Sent to ${recipients.length} admin(s).`)
process.exit(0)
