import type { AdminApplicationDetail } from "@/types"
import { ApplicationStatusBadge } from "./application-status-badge"
import { STATUS_CONFIG } from "@/types"

interface Props {
  history: AdminApplicationDetail["statusHistory"]
}

const TRIGGERED_BY_STYLES: Record<string, string> = {
  admin: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  ai: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  user: "bg-zinc-700 text-zinc-300 border border-zinc-600",
  system: "bg-zinc-700 text-zinc-300 border border-zinc-600",
}

const STATUS_DOT_COLORS: Record<string, string> = {
  blue: "bg-blue-400",
  yellow: "bg-yellow-400",
  purple: "bg-purple-400",
  orange: "bg-orange-400",
  green: "bg-green-400",
  red: "bg-red-400",
  gray: "bg-zinc-400",
}

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function StatusHistoryTimeline({ history }: Props) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">No status history recorded.</p>
    )
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-zinc-800" />

      {history.map((entry) => {
        const toConfig = STATUS_CONFIG[entry.toStatus]
        const dotColor = STATUS_DOT_COLORS[toConfig?.color ?? "gray"] ?? "bg-zinc-400"
        const triggerStyle =
          TRIGGERED_BY_STYLES[entry.triggeredBy.toLowerCase()] ??
          TRIGGERED_BY_STYLES["system"]

        return (
          <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Dot */}
            <div className="relative z-10 mt-1 shrink-0">
              <div className={["w-5 h-5 rounded-full border-2 border-zinc-900 flex items-center justify-center", dotColor].join(" ")}>
                <div className="w-2 h-2 rounded-full bg-zinc-900 opacity-60" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Status transition */}
              <div className="flex flex-wrap items-center gap-2">
                {entry.fromStatus ? (
                  <>
                    <ApplicationStatusBadge status={entry.fromStatus} />
                    <span className="text-zinc-600 text-xs">→</span>
                    <ApplicationStatusBadge status={entry.toStatus} />
                  </>
                ) : (
                  <ApplicationStatusBadge status={entry.toStatus} />
                )}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span
                  className={[
                    "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                    triggerStyle,
                  ].join(" ")}
                >
                  {entry.triggeredBy}
                </span>
                <span className="text-zinc-500 text-xs" title={new Date(entry.createdAt).toLocaleString()}>
                  {relativeTime(entry.createdAt)}
                </span>
                <span className="text-zinc-600 text-xs hidden sm:inline">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Reason */}
              {entry.reason && (
                <p className="text-xs text-zinc-400 mt-1">{entry.reason}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
