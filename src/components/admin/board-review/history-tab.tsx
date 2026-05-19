"use client"

import { useCallback, useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import type { ApiResponse } from "@/types"
import type { HistoryPage, HistoryRow } from "@/lib/board-review/types"
import type { ReviewStatus } from "@prisma/client"

const PAGE_SIZE = 25

const STATUS_COLORS: Record<ReviewStatus, string> = {
  PENDING: "text-zinc-400 bg-zinc-800",
  APPROVED: "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30",
  NEEDS_REVIEW: "text-amber-300 bg-amber-500/10 border border-amber-500/30",
  REJECTED: "text-red-300 bg-red-500/10 border border-red-500/30",
}

/**
 * History table: union of CompanyBoard + BoardReviewMiss rows whose
 * reviewStatus is non-PENDING. Each row exposes a "Revert to PENDING"
 * button that POSTs to /api/admin/board-review/revert and refreshes the
 * current page.
 */
export function HistoryTab() {
  const [data, setData] = useState<HistoryPage | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/board-review/history?page=${p}&limit=${PAGE_SIZE}`, {
        cache: "no-store",
      })
      const json: ApiResponse<HistoryPage> = await res.json()
      if (!json.success || !json.data) {
        throw new Error(json.error ?? "Failed to load history")
      }
      setData(json.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page])

  async function handleRevert(row: HistoryRow) {
    const ok = confirm(
      `Revert "${row.name}" back to PENDING? Rejected jobs will NOT be re-activated automatically — re-approve in the queue if you want them back.`
    )
    if (!ok) return
    setRevertingId(`${row.kind}:${row.id}`)
    try {
      const res = await fetch("/api/admin/board-review/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, id: row.id }),
      })
      const json: ApiResponse<unknown> = await res.json()
      if (!json.success) throw new Error(json.error ?? "Revert failed")
      await load(page)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revert failed"
      alert(message)
    } finally {
      setRevertingId(null)
    }
  }

  if (loading && !data) {
    return <div className="p-8 text-center text-zinc-500">Loading history...</div>
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        {error}
      </div>
    )
  }

  if (!data) return null

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actioned at</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No reviewed items yet.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={`${row.kind}:${row.id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-xs uppercase text-zinc-400">{row.kind}</td>
                  <td className="px-4 py-3 text-white truncate max-w-xs" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={["text-[11px] px-2 py-0.5 rounded", STATUS_COLORS[row.reviewStatus]].join(" ")}>
                      {row.reviewStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs font-mono truncate max-w-[10rem]" title={row.reviewedBy ?? ""}>
                    {row.reviewedBy ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[14rem]" title={row.reviewerNotes ?? ""}>
                    {row.reviewerNotes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleRevert(row)}
                      disabled={revertingId === `${row.kind}:${row.id}`}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-violet-300 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Revert
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Page {data.page} of {totalPages} · {data.total} total
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 disabled:opacity-50 hover:bg-zinc-800"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 disabled:opacity-50 hover:bg-zinc-800"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
