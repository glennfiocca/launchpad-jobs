import Link from "next/link"
import { db } from "@/lib/db"
import { StatCard } from "@/components/admin/stat-card"
import { TriggerSyncButton } from "@/components/admin/trigger-sync-button"
import type { SyncStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

function formatDuration(ms: number | null): string {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

function StatusBadge({ status }: { status: SyncStatus }) {
  const styles: Record<SyncStatus, string> = {
    SUCCESS: "text-emerald-400 bg-emerald-400/10",
    PARTIAL_FAILURE: "text-yellow-400 bg-yellow-400/10",
    FAILURE: "text-red-400 bg-red-400/10",
    RUNNING: "text-blue-400 bg-blue-400/10",
  }
  const labels: Record<SyncStatus, string> = {
    SUCCESS: "Success",
    PARTIAL_FAILURE: "Partial",
    FAILURE: "Failed",
    RUNNING: "Running",
  }
  return (
    <span className={["px-2 py-0.5 rounded text-xs font-medium", styles[status]].join(" ")}>
      {labels[status]}
    </span>
  )
}

function formatTriggeredBy(triggeredBy: string): string {
  if (triggeredBy === "cron") return "cron"
  if (triggeredBy.startsWith("admin:")) return `admin: ${triggeredBy.slice("admin:".length)}`
  return triggeredBy
}

export default async function SyncLogsPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [logs, totalSyncs30d, successCount30d, lastSync] = await Promise.all([
    db.syncLog.findMany({
      take: 50,
      orderBy: { startedAt: "desc" },
    }),
    db.syncLog.count({
      where: { startedAt: { gte: thirtyDaysAgo } },
    }),
    db.syncLog.count({
      where: {
        startedAt: { gte: thirtyDaysAgo },
        status: "SUCCESS",
      },
    }),
    db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
  ])

  const successRate =
    totalSyncs30d > 0 ? Math.round((successCount30d / totalSyncs30d) * 100) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sync Logs</h1>
          <p className="text-zinc-400 text-sm mt-1">Greenhouse board sync history and audit trail</p>
        </div>
        <TriggerSyncButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Last Sync"
          value={lastSync ? formatDateTime(lastSync.startedAt) : "Never"}
        />
        <StatCard
          label="Last Sync Status"
          value={lastSync ? lastSync.status.replace("_", " ") : "—"}
        />
        <StatCard
          label="Total Syncs (30d)"
          value={totalSyncs30d}
        />
        <StatCard
          label="Success Rate (30d)"
          value={successRate !== null ? `${successRate}%` : "—"}
          sub={totalSyncs30d > 0 ? `${successCount30d} of ${totalSyncs30d} succeeded` : undefined}
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Started At</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Triggered By</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Boards</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Changes</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Duration</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No sync logs yet. Trigger a sync to get started.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-zinc-300 text-xs whitespace-nowrap">
                    {formatDateTime(log.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {formatTriggeredBy(log.triggeredBy)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300 text-xs tabular-nums">
                    {log.boardsSynced}/{log.totalBoards}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    <span className="text-emerald-400">+{log.totalAdded}</span>
                    {" / "}
                    <span className="text-blue-400">~{log.totalUpdated}</span>
                    {" / "}
                    <span className="text-zinc-500">-{log.totalDeactivated}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs tabular-nums">
                    {formatDuration(log.durationMs)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/sync/${log.id}`}
                      className="text-xs text-violet-400 hover:text-violet-300 hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
