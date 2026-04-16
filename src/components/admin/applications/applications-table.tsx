"use client"

import { useRouter } from "next/navigation"
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import type { AdminApplication } from "@/types"
import { ApplicationStatusBadge } from "./application-status-badge"
import { DispatchStatusBadge } from "./dispatch-status-badge"

type SortCol = "appliedAt" | "updatedAt" | "status"
type SortDir = "asc" | "desc"

interface Props {
  applications: AdminApplication[]
  loading: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onSort: (col: SortCol) => void
  sortBy: string
  sortDir: SortDir
}

export function ApplicationsTable({
  applications,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSort,
  sortBy,
  sortDir,
}: Props) {
  const router = useRouter()
  const allSelected =
    applications.length > 0 && applications.every((a) => selectedIds.has(a.id))

  function SortIcon({ col }: { col: SortCol }) {
    if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />
    if (sortDir === "asc") return <ChevronUp className="w-3 h-3 ml-1" />
    return <ChevronDown className="w-3 h-3 ml-1" />
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="rounded border-zinc-600 bg-zinc-800 accent-violet-500"
              />
            </th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">User</th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">Job / Company</th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">
              <button
                onClick={() => onSort("status")}
                className="inline-flex items-center hover:text-white transition-colors"
              >
                Status
                <SortIcon col="status" />
              </button>
            </th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">Dispatch</th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">Emails</th>
            <th className="text-left px-4 py-3 text-zinc-400 font-medium">
              <button
                onClick={() => onSort("appliedAt")}
                className="inline-flex items-center hover:text-white transition-colors"
              >
                Applied
                <SortIcon col="appliedAt" />
              </button>
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </>
          ) : applications.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                No applications found.
              </td>
            </tr>
          ) : (
            applications.map((app) => (
              <tr
                key={app.id}
                onClick={() => router.push(`/admin/applications/${app.id}`)}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
              >
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(app.id)}
                    onChange={() => onToggleSelect(app.id)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-violet-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="text-white">{app.user.name ?? "—"}</p>
                  <p className="text-zinc-400 text-xs">{app.user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-white">{app.job.title}</p>
                  <p className="text-zinc-400 text-xs">{app.job.company.name}</p>
                </td>
                <td className="px-4 py-3">
                  <ApplicationStatusBadge status={app.status} />
                </td>
                <td className="px-4 py-3">
                  <DispatchStatusBadge status={app.dispatchStatus} />
                </td>
                <td className="px-4 py-3 text-zinc-300">{app._count.emails}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {new Date(app.appliedAt).toLocaleDateString()}
                </td>
                <td
                  className="px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => router.push(`/admin/applications/${app.id}`)}
                    className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
