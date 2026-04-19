// scripts/clear-sync-logs.ts
// ONE-TIME MAINTENANCE: Delete all SyncLog and SyncBoardResult rows.
//
// CAUTION: This permanently deletes sync history. Back up production DB before running.
//
// Usage:
//   # Dry run (shows counts, no deletion):
//   npx tsx scripts/clear-sync-logs.ts
//
//   # Confirm deletion:
//   npx tsx scripts/clear-sync-logs.ts --confirm
//
// SyncBoardResult rows are deleted first (cascade-safe), then SyncLog rows.

import { db } from "@/lib/db"

if (!process.env.DATABASE_URL) {
  console.error("[clear-sync-logs] ERROR: DATABASE_URL not set")
  process.exit(1)
}

const confirm = process.argv.includes("--confirm")

const [logCount, boardResultCount] = await Promise.all([
  db.syncLog.count(),
  db.syncBoardResult.count(),
])

console.log(`[clear-sync-logs] Current state:`)
console.log(`  SyncLog rows:        ${logCount}`)
console.log(`  SyncBoardResult rows: ${boardResultCount}`)

if (!confirm) {
  console.log("")
  console.log("[clear-sync-logs] DRY RUN — no changes made.")
  console.log("[clear-sync-logs] To delete all rows, run with --confirm:")
  console.log("")
  console.log("  npx tsx scripts/clear-sync-logs.ts --confirm")
  console.log("")
  console.log("[clear-sync-logs] REMINDER: Back up production DB before running --confirm in production.")
  process.exit(0)
}

console.log("")
console.log("[clear-sync-logs] --confirm passed. Deleting all sync history...")

// Delete board results first (safe even with cascade, makes intent explicit)
const { count: deletedBoardResults } = await db.syncBoardResult.deleteMany()
console.log(`[clear-sync-logs] Deleted ${deletedBoardResults} SyncBoardResult rows`)

const { count: deletedLogs } = await db.syncLog.deleteMany()
console.log(`[clear-sync-logs] Deleted ${deletedLogs} SyncLog rows`)

console.log("[clear-sync-logs] Done. Sync history cleared.")
process.exit(0)
