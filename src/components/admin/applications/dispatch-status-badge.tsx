import type { DispatchStatus } from "@/types"
import { AlertTriangle } from "lucide-react"

interface Props {
  status: DispatchStatus
}

const DISPATCH_STYLES: Record<DispatchStatus, { badge: string; label: string; icon?: boolean }> = {
  DISPATCHED: {
    badge: "bg-green-500/15 text-green-300 border border-green-500/30",
    label: "Dispatched",
  },
  FAILED: {
    badge: "bg-red-500/15 text-red-300 border border-red-500/30",
    label: "Failed",
    icon: true,
  },
  PENDING: {
    badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    label: "Pending",
  },
}

export function DispatchStatusBadge({ status }: Props) {
  const config = DISPATCH_STYLES[status]

  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
        config.badge,
      ].join(" ")}
    >
      {config.icon && <AlertTriangle className="w-3 h-3" />}
      {config.label}
    </span>
  )
}
