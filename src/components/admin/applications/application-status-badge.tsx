import type { ApplicationStatus } from "@/types"
import { STATUS_CONFIG } from "@/types"

interface Props {
  status: ApplicationStatus
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500/20 text-blue-400",
  yellow: "bg-yellow-500/20 text-yellow-400",
  purple: "bg-purple-500/20 text-purple-400",
  orange: "bg-orange-500/20 text-orange-400",
  green: "bg-green-500/20 text-green-400",
  red: "bg-red-500/20 text-red-400",
  gray: "bg-zinc-500/20 text-zinc-400",
}

export function ApplicationStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status]
  const colorClass = COLOR_MAP[config?.color ?? "gray"] ?? COLOR_MAP["gray"]

  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        colorClass,
      ].join(" ")}
    >
      {config?.label ?? status}
    </span>
  )
}
