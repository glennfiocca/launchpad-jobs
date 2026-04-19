// DEPRECATED: This HTTP-based trigger is no longer used in production.
// Production cron uses scripts/sync-cron.ts (direct Prisma, no HTTP round-trip).
// This file is kept for reference only. Do not configure DO to use this script.
//
// scripts/sync-cron.mjs
// Cron job: calls the job sync API endpoint.
// Runs via DigitalOcean scheduled job at 09:00 UTC (04:00 EST).

const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
const cronSecret = process.env.CRON_SECRET

if (!appUrl) {
  console.error("[sync-cron] ERROR: NEXTAUTH_URL or NEXT_PUBLIC_APP_URL not set")
  process.exit(1)
}

if (!cronSecret) {
  console.error("[sync-cron] ERROR: CRON_SECRET not set")
  process.exit(1)
}

const url = `${appUrl.replace(/\/$/, "")}/api/jobs/sync`
console.log(`[sync-cron] Triggering sync at ${url}`)
console.log(`[sync-cron] Started at: ${new Date().toISOString()}`)

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
  })

  const body = await res.json().catch(() => null)

  if (!res.ok) {
    console.error(`[sync-cron] HTTP ${res.status}: ${JSON.stringify(body)}`)
    process.exit(1)
  }

  console.log(`[sync-cron] Success (HTTP ${res.status})`)
  if (body?.data) {
    const d = body.data
    console.log(`[sync-cron] Boards: ${d.boardsSynced}/${d.totalBoards} synced, ${d.boardsFailed} failed`)
    console.log(`[sync-cron] Jobs: +${d.totalAdded} added, ~${d.totalUpdated} updated, -${d.totalDeactivated} deactivated`)
    console.log(`[sync-cron] Applications updated: ${d.totalApplicationsUpdated}`)
    console.log(`[sync-cron] Duration: ${d.durationMs}ms`)
    if (body.error) console.warn(`[sync-cron] WARNING: ${body.error}`)
  }

  console.log(`[sync-cron] Completed at: ${new Date().toISOString()}`)
} catch (err) {
  console.error(`[sync-cron] FATAL: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
