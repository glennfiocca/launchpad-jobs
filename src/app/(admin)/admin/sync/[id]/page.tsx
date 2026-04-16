import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import type { SyncStatus, SyncBoardStatus } from "@prisma/client"

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
    second: "2-digit",
    hour12: true,
  }).format(date)
}

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const styles: Record<SyncStatus, string> = {
    SUCCESS: "text-emerald-400 bg-emerald-400/10",
    PARTIAL_FAILURE: "text-yellow-400 bg-yellow-400/10",
    FAILURE: "text-red-400 bg-red-400/10",
    RUNNING: "text-blue-400 bg-blue-400/10",
  }
  const labels: Record<SyncStatus, string> = {
    SUCCESS: "Success",
    PARTIAL_FAILURE: "Partial Failure",
    FAILURE: "Failed",
    RUNNING: "Running",
  }
  return (
    <span className={["px-2 py-0.5 rounded text-xs font-medium", styles[status]].join(" ")}>
      {labels[status]}
    </span>
  )
}

function BoardStatusBadge({ status }: { status: SyncBoardStatus }) {
  const styles: Record<SyncBoardStatus, string> = {
    SUCCESS: "text-emerald-400 bg-emerald-400/10",
    FAILURE: "text-red-400 bg-red-400/10",
    SKIPPED: "text-zinc-400 bg-zinc-700/50",
  }
  return (
    <span className={["px-2 py-0.5 rounded text-xs font-medium", styles[status]].join(" ")}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
  )
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SyncDetailPage({ params }: PageProps) {
  const { id } = await params
  const [log, boardResults] = await Promise.all([
    db.syncLog.findUnique({ where: { id } }),
    db.syncBoardResult.findMany({
      where: { syncLogId: id },
      orderBy: { startedAt: "asc" },
    }),
  ])

  if (!log) notFound()

  const triggeredByLabel =
    log.triggeredBy === "cron"
      ? "cron"
      : log.triggeredBy.startsWith("admin:")
        ? `admin: ${log.triggeredBy.slice("admin:".length)}`
        : log.triggeredBy

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/sync"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
      >
        ← Back to Sync Logs
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">
              {formatDateTime(log.startedAt)}
            </h1>
            <SyncStatusBadge status={log.status} />
          </div>
          <p className="text-zinc-400 text-sm">
            Triggered by {triggeredByLabel}
            {log.completedAt && (
              <> · Completed {formatDateTime(log.completedAt)}</>
            )}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatItem label="Duration" value={formatDuration(log.durationMs)} />
        <StatItem label="Boards Synced" value={`${log.boardsSynced}/${log.totalBoards}`} />
        <StatItem label="Jobs Added" value={log.totalAdded} />
        <StatItem label="Jobs Updated" value={log.totalUpdated} />
        <StatItem label="Deactivated" value={log.totalDeactivated} />
        <StatItem label="Apps Updated" value={log.totalApplicationsUpdated} />
        <StatItem label="Boards Failed" value={log.boardsFailed} />
      </div>

      {/* Error summary */}
      {log.errorSummary && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-red-400 mb-2">Error Summary</h2>
          <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono">
            {log.errorSummary}
          </pre>
        </div>
      )}

      {/* Per-board results */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Board Results</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Board</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Added</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Updated</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Deactivated</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Apps Updated</th>
              <th className="text-right px-4 py-3 text-zinc-400 font-medium">Duration</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {boardResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No board results recorded.
                </td>
              </tr>
            ) : (
              boardResults.map((result) => (
                <tr
                  key={result.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-white text-xs font-medium">{result.boardName ?? result.boardToken}</p>
                    <code className="text-[10px] text-zinc-500 font-mono">{result.boardToken}</code>
                  </td>
                  <td className="px-4 py-3">
                    <BoardStatusBadge status={result.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-400 text-xs tabular-nums">
                    {result.added}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-400 text-xs tabular-nums">
                    {result.updated}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 text-xs tabular-nums">
                    {result.deactivated}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 text-xs tabular-nums">
                    {result.applicationsUpdated}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 text-xs tabular-nums">
                    {formatDuration(result.durationMs)}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {result.errors.length > 0 ? (
                      <p className="text-xs text-red-400 truncate" title={result.errors.join("\n")}>
                        {result.errors.join("; ")}
                      </p>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
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
