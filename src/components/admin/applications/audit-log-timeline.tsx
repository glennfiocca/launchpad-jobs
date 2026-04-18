"use client"

import { formatDistanceToNow } from "date-fns"
import type { AdminApplicationDetail } from "@/types/admin"

type AuditLog = AdminApplicationDetail["auditLogs"][number]

interface Props {
  logs: AuditLog[]
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CLAIM: { label: "Claimed", color: "text-blue-400" },
  RELEASE: { label: "Released", color: "text-zinc-400" },
  FILL_PACKAGE_ISSUED: { label: "Fill package issued", color: "text-violet-400" },
  OPERATOR_SUBMITTED: { label: "Operator submitted", color: "text-green-400" },
  OPERATOR_FAILED: { label: "Operator failed", color: "text-red-400" },
  PLAYWRIGHT_RESULT: { label: "Playwright result", color: "text-amber-400" },
}

export function AuditLogTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return <p className="text-zinc-500 text-sm">No audit events yet.</p>
  }

  return (
    <ol className="relative border-l border-zinc-800 space-y-4 pl-6">
      {logs.map((log) => {
        const config = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-zinc-300" }
        const actor = log.actor?.name ?? log.actor?.email ?? "System"
        return (
          <li key={log.id} className="relative">
            <span className="absolute -left-[1.425rem] top-1 w-2.5 h-2.5 rounded-full bg-zinc-700 border border-zinc-600" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">by {actor}</p>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <pre className="text-xs text-zinc-500 mt-1 font-mono leading-relaxed whitespace-pre-wrap">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                )}
              </div>
              <span className="shrink-0 text-xs text-zinc-600">
                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
