"use client"

import { STATUS_CONFIG } from "@/types"
import type { ApplicationStatus } from "@/types"

interface Filters {
  search: string
  status?: string
  dispatchStatus?: string
  sortBy: string
  sortDir: string
}

interface Props {
  filters: Filters
  onChange: (next: Filters) => void
}

const APPLICATION_STATUSES = Object.keys(STATUS_CONFIG) as ApplicationStatus[]

export function ApplicationFilters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="Search user, job, company..."
          value={filters.search}
          onChange={(e) =>
            onChange({ ...filters, search: e.target.value })
          }
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      {/* Status select */}
      <div>
        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value || undefined })
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All Statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      </div>

      {/* Dispatch status select */}
      <div>
        <select
          value={filters.dispatchStatus ?? ""}
          onChange={(e) =>
            onChange({ ...filters, dispatchStatus: e.target.value || undefined })
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All Dispatch</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="FAILED">Failed</option>
          <option value="PENDING">Pending</option>
          <option value="AWAITING_OPERATOR">Awaiting Operator</option>
        </select>
      </div>

      {/* Sort by */}
      <div>
        <select
          value={filters.sortBy}
          onChange={(e) =>
            onChange({ ...filters, sortBy: e.target.value })
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="appliedAt">Applied At</option>
          <option value="updatedAt">Updated At</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Sort direction */}
      <div>
        <select
          value={filters.sortDir}
          onChange={(e) =>
            onChange({ ...filters, sortDir: e.target.value })
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {/* Reset */}
      <button
        onClick={() =>
          onChange({
            search: "",
            status: undefined,
            dispatchStatus: undefined,
            sortBy: "appliedAt",
            sortDir: "desc",
          })
        }
        className="px-3 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
      >
        Reset
      </button>
    </div>
  )
}
