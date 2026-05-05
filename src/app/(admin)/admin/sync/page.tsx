import Link from "next/link"
import { db } from "@/lib/db"
import { StatCard } from "@/components/admin/stat-card"
import { TriggerSyncButton } from "@/components/admin/trigger-sync-button"
import {
  SyncLogFilters,
  type ProviderFilter,
  type SyncStatusFilter,
} from "@/components/admin/sync/sync-log-filters"
import type { AtsProvider, LogoSource, Prisma, SyncStatus } from "@prisma/client"

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

// Display order + labels for the LogoSource distribution panel.
// Track B.5 of HARDENING_PLAN.md.
const LOGO_SOURCE_ROWS: ReadonlyArray<{ key: LogoSource | "null"; label: string }> = [
  { key: "spaces_cache", label: "Spaces cache" },
  { key: "override", label: "Override / ATS-supplied" },
  { key: "logodev", label: "logo.dev (uncached)" },
  { key: "monogram", label: "Monogram fallback" },
  { key: "none", label: "None (enrichment failed)" },
  { key: "null", label: "Not yet enriched" },
]

// ─── searchParams parsing — Track D.2 of HARDENING_PLAN.md ──────────────────
//
// Next.js App Router gives us `searchParams: { [key: string]: string | string[] | undefined }`.
// We narrow each input to its strict union (or undefined) before building
// the Prisma `where` so we never pass an unsanitised string to the query.

type SyncSearchParams = {
  status?: string | string[]
  provider?: string | string[]
  fromDate?: string | string[]
  toDate?: string | string[]
  page?: string | string[]
}

interface PageProps {
  searchParams: Promise<SyncSearchParams> | SyncSearchParams
}

const VALID_STATUSES: ReadonlySet<SyncStatusFilter> = new Set([
  "SUCCESS",
  "PARTIAL_FAILURE",
  "FAILURE",
  "all",
])

const VALID_PROVIDERS: ReadonlySet<ProviderFilter> = new Set(["GREENHOUSE", "ASHBY", "all"])

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function parseStatus(raw: string | undefined): SyncStatusFilter {
  if (raw && VALID_STATUSES.has(raw as SyncStatusFilter)) return raw as SyncStatusFilter
  return "all"
}

function parseProvider(raw: string | undefined): ProviderFilter {
  if (raw && VALID_PROVIDERS.has(raw as ProviderFilter)) return raw as ProviderFilter
  return "all"
}

// Accept ISO date (YYYY-MM-DD) or full ISO datetime. Returns null if unparseable.
function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export default async function SyncLogsPage({ searchParams }: PageProps) {
  const resolved = await Promise.resolve(searchParams)
  const statusFilter = parseStatus(firstString(resolved.status))
  const providerFilter = parseProvider(firstString(resolved.provider))
  const fromDateRaw = firstString(resolved.fromDate)
  const toDateRaw = firstString(resolved.toDate)
  const fromDate = parseDate(fromDateRaw)
  const toDate = parseDate(toDateRaw)

  // Provider filter — SyncLog has no `provider` column. Provider lives on
  // Company, joined to SyncBoardResult via boardToken. We resolve the token
  // set once, then filter SyncLog by `boardResults.some.boardToken in set`.
  let boardTokensForProvider: string[] | null = null
  if (providerFilter !== "all") {
    const companies = await db.company.findMany({
      where: { provider: providerFilter as AtsProvider },
      select: { slug: true },
    })
    boardTokensForProvider = companies.map((c) => c.slug)
  }

  // Build the Prisma where for SyncLog.
  const startedAtFilter: Prisma.DateTimeFilter | undefined =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined

  const where: Prisma.SyncLogWhereInput = {
    ...(statusFilter !== "all" ? { status: statusFilter as SyncStatus } : {}),
    ...(startedAtFilter ? { startedAt: startedAtFilter } : {}),
    ...(boardTokensForProvider
      ? {
          boardResults: { some: { boardToken: { in: boardTokensForProvider } } },
        }
      : {}),
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [logs, totalSyncs30d, completedCount30d, lastSync, logoSourceGroups] =
    await Promise.all([
      db.syncLog.findMany({
        where,
        take: 50,
        orderBy: { startedAt: "desc" },
      }),
      db.syncLog.count({
        where: { startedAt: { gte: thirtyDaysAgo } },
      }),
      db.syncLog.count({
        where: {
          startedAt: { gte: thirtyDaysAgo },
          status: { in: ["SUCCESS", "PARTIAL_FAILURE"] },
        },
      }),
      db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
      // Logos by source distribution. Tiny query — single GROUP BY on a
      // small enum column on Company. Renders as a flat row list (no
      // charting library — keeps the bundle lean).
      db.company.groupBy({
        by: ["logoSource"],
        _count: { _all: true },
      }),
    ])

  const successRate =
    totalSyncs30d > 0 ? Math.round((completedCount30d / totalSyncs30d) * 100) : null

  const logoCountByKey = new Map<LogoSource | "null", number>()
  let logoTotal = 0
  for (const g of logoSourceGroups) {
    const key: LogoSource | "null" = g.logoSource ?? "null"
    logoCountByKey.set(key, g._count._all)
    logoTotal += g._count._all
  }

  const filtersActive =
    statusFilter !== "all" ||
    providerFilter !== "all" ||
    Boolean(fromDate) ||
    Boolean(toDate)

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
          label="Completed Rate (30d)"
          value={successRate !== null ? `${successRate}%` : "—"}
          sub={totalSyncs30d > 0 ? `${completedCount30d} of ${totalSyncs30d} completed (SUCCESS or PARTIAL)` : undefined}
        />
      </div>

      {/* Logos by source — Track B.5 of HARDENING_PLAN.md. Surfaces the
          distribution of where each Company.logoUrl came from so we can
          tell at a glance how many brands fall through to the monogram
          fallback. */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-300">Logos by source</h2>
          <span className="text-xs text-zinc-500 tabular-nums">
            {logoTotal.toLocaleString()} companies
          </span>
        </div>
        <ul className="space-y-1.5">
          {LOGO_SOURCE_ROWS.map((row) => {
            const count = logoCountByKey.get(row.key) ?? 0
            const pct = logoTotal > 0 ? Math.round((count / logoTotal) * 100) : 0
            return (
              <li
                key={row.key}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-zinc-400">{row.label}</span>
                <span className="text-zinc-300 tabular-nums">
                  {count.toLocaleString()}{" "}
                  <span className="text-zinc-500">({pct}%)</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Filter bar — Track D.2 of HARDENING_PLAN.md. Client component;
          submits via URL search params so the server re-renders with new
          Prisma filters. */}
      <SyncLogFilters
        initial={{
          status: statusFilter,
          provider: providerFilter,
          fromDate: fromDateRaw ?? "",
          toDate: toDateRaw ?? "",
        }}
      />

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
                  {filtersActive
                    ? "No sync runs match these filters. Try widening the date range or clearing filters."
                    : "No sync logs yet. Trigger a sync to get started."}
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
