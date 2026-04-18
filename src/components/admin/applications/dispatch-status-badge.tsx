import type { DispatchStatus } from "@/types/admin"
import { AlertTriangle, Clock } from "lucide-react"

interface Props {
  status: DispatchStatus
}

const DISPATCH_STYLES: Record<DispatchStatus, { badge: string; label: string; icon?: "alert" | "clock" }> = {
  DISPATCHED: {
    badge: "bg-green-500/15 text-green-300 border border-green-500/30",
    label: "Dispatched",
  },
  FAILED: {
    badge: "bg-red-500/15 text-red-300 border border-red-500/30",
    label: "Failed",
    icon: "alert",
  },
  PENDING: {
    badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    label: "Pending",
  },
  AWAITING_OPERATOR: {
    badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    label: "Awaiting Operator",
    icon: "clock",
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
      {config.icon === "alert" && <AlertTriangle className="w-3 h-3" />}
      {config.icon === "clock" && <Clock className="w-3 h-3" />}
      {config.label}
    </span>
  )
}
