import type { AdminApplicationStats } from "@/types"
import { STATUS_CONFIG } from "@/types"

interface Props {
  stats: AdminApplicationStats | null
}

const COLOR_BG: Record<string, string> = {
  blue: "bg-blue-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  green: "bg-green-500",
  red: "bg-red-500",
  gray: "bg-zinc-500",
}

const COLOR_TEXT: Record<string, string> = {
  blue: "text-blue-400",
  yellow: "text-yellow-400",
  purple: "text-purple-400",
  orange: "text-orange-400",
  green: "text-green-400",
  red: "text-red-400",
  gray: "text-zinc-400",
}

export function ApplicationStatsCards({ stats }: Props) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse h-24"
          />
        ))}
      </div>
    )
  }

  const dispatchRateColor =
    stats.dispatchRate >= 90
      ? "text-green-400"
      : stats.dispatchRate >= 70
      ? "text-yellow-400"
      : "text-red-400"

  const byStatusTotal = stats.byStatus.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Applications */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-400">Total Applications</p>
          <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
          <p className="text-xs text-zinc-500 mt-1">+{stats.last7d} last 7d</p>
        </div>

        {/* Dispatch Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-400">Dispatch Rate</p>
          <p className={["text-3xl font-bold mt-1", dispatchRateColor].join(" ")}>
            {stats.dispatchRate.toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {stats.dispatched} of {stats.total} dispatched
          </p>
        </div>

        {/* Failed Dispatches */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-400">Failed Dispatches</p>
          <p
            className={[
              "text-3xl font-bold mt-1",
              stats.failedDispatch > 0 ? "text-red-400" : "text-white",
            ].join(" ")}
          >
            {stats.failedDispatch}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {stats.failedDispatchLast24h > 0
              ? `${stats.failedDispatchLast24h} in last 24h`
              : "None in last 24h"}
          </p>
        </div>

        {/* Last 7 Days */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-400">Last 7 Days</p>
          <p className="text-3xl font-bold text-white mt-1">{stats.last7d}</p>
          <p className="text-xs text-zinc-500 mt-1">{stats.last30d} last 30d</p>
        </div>
      </div>

      {/* Status funnel bar */}
      {stats.byStatus.length > 0 && byStatusTotal > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
            Status Breakdown
          </p>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {stats.byStatus
              .filter((s) => s.count > 0)
              .map((s) => {
                const config = STATUS_CONFIG[s.status]
                const pct = (s.count / byStatusTotal) * 100
                return (
                  <div
                    key={s.status}
                    title={`${config?.label ?? s.status}: ${s.count}`}
                    className={[
                      "h-full transition-all",
                      COLOR_BG[config?.color ?? "gray"] ?? "bg-zinc-500",
                    ].join(" ")}
                    style={{ width: `${pct}%` }}
                  />
                )
              })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {stats.byStatus
              .filter((s) => s.count > 0)
              .sort((a, b) => b.count - a.count)
              .map((s) => {
                const config = STATUS_CONFIG[s.status]
                return (
                  <span
                    key={s.status}
                    className={[
                      "text-xs",
                      COLOR_TEXT[config?.color ?? "gray"] ?? "text-zinc-400",
                    ].join(" ")}
                  >
                    {config?.label ?? s.status}: {s.count}
                  </span>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
