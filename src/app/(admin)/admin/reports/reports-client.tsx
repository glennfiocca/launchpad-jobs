"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { ReportCategory, ReportStatus } from "@prisma/client"

interface SerializedReport {
  id: string
  category: ReportCategory
  status: ReportStatus
  message: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  adminNote: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; email: string | null; name: string | null }
  job: {
    id: string
    title: string
    publicJobId: string
    company: { id: string; name: string }
  } | null
}

type CategoryKey = "SPAM" | "INACCURATE" | "OFFENSIVE" | "BROKEN_LINK" | "OTHER"
type StatusKey = "OPEN" | "TRIAGED" | "RESOLVED" | "DISMISSED"

interface ConfigEntry {
  label: string
  color: string
  bg: string
}

interface AdminReportsClientProps {
  initialReports: SerializedReport[]
  categoryConfig: Record<CategoryKey, ConfigEntry>
  statusConfig: Record<StatusKey, ConfigEntry>
}

const NEXT_STATUS: Partial<Record<StatusKey, StatusKey>> = {
  OPEN: "TRIAGED",
  TRIAGED: "RESOLVED",
}

export function AdminReportsClient({
  initialReports,
  categoryConfig,
  statusConfig,
}: AdminReportsClientProps) {
  const [reports, setReports] = useState<SerializedReport[]>(initialReports)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusKey | "ALL">("OPEN")

  const visible = filter === "ALL" ? reports : reports.filter((r) => r.status === filter)

  async function updateStatus(id: string, status: StatusKey, adminNote?: string) {
    setPendingId(id)
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote }),
      })
      const data = await res.json()
      if (!data.success) {
        toast.error(data.error ?? "Failed to update report")
        return
      }
      setReports((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                resolvedAt: data.data.resolvedAt,
                resolvedBy: data.data.resolvedBy,
                adminNote: adminNote ?? r.adminNote,
                updatedAt: data.data.updatedAt,
              }
            : r
        )
      )
      toast.success(`Report marked as ${status.toLowerCase()}`)
    } catch {
      toast.error("Failed to update report")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["ALL", "OPEN", "TRIAGED", "RESOLVED", "DISMISSED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={[
              "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
              filter === s
                ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white",
            ].join(" ")}
          >
            {s === "ALL" ? "All" : statusConfig[s].label}
            {s !== "ALL" && (
              <span className="ml-1.5 text-zinc-500">
                {reports.filter((r) => r.status === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-zinc-500 text-sm">No reports in this category.</p>
      )}

      {visible.map((report) => {
        const catConf = categoryConfig[report.category as CategoryKey]
        const statConf = statusConfig[report.status as StatusKey]
        const nextStatus = NEXT_STATUS[report.status as StatusKey]
        const isPending = pendingId === report.id

        return (
          <div key={report.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${catConf.bg} ${catConf.color}`}
                >
                  {catConf.label}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statConf.bg} ${statConf.color}`}
                >
                  {statConf.label}
                </span>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(report.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Job info */}
            {report.job ? (
              <div className="text-sm text-zinc-200">
                <span className="font-medium">{report.job.title}</span>
                <span className="text-zinc-500"> — {report.job.company.name}</span>
                <span className="text-xs text-zinc-600 ml-2 font-mono">{report.job.publicJobId}</span>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 italic">Job listing no longer exists</p>
            )}

            {/* Message */}
            {report.message && (
              <p className="text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-800 rounded-lg px-3 py-2">
                {report.message}
              </p>
            )}

            {/* Reporter */}
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <span>Reported by: {report.user.email ?? report.user.id}</span>
              {report.resolvedBy && (
                <span>Resolved by: {report.resolvedBy}</span>
              )}
            </div>

            {/* Admin note */}
            {report.adminNote && (
              <p className="text-xs text-zinc-400 italic">Admin note: {report.adminNote}</p>
            )}

            {/* Actions */}
            {(nextStatus || report.status !== "DISMISSED") && (
              <div className="flex gap-2 pt-1">
                {nextStatus && (
                  <button
                    disabled={isPending}
                    onClick={() => updateStatus(report.id, nextStatus)}
                    className="px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-400 text-xs font-medium hover:bg-violet-500/25 transition-colors disabled:opacity-50"
                  >
                    {isPending ? "Updating…" : `Mark as ${statusConfig[nextStatus].label}`}
                  </button>
                )}
                {report.status !== "DISMISSED" && (
                  <button
                    disabled={isPending}
                    onClick={() => updateStatus(report.id, "DISMISSED")}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
