"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AdminApplication, AdminApplicationStats } from "@/types"
import { ApplicationStatsCards } from "@/components/admin/applications/application-stats-cards"
import { ApplicationFilters } from "@/components/admin/applications/application-filters"
import { ApplicationsTable } from "@/components/admin/applications/applications-table"

interface Filters {
  search: string
  status?: string
  dispatchStatus?: string
  sortBy: string
  sortDir: string
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  status: undefined,
  dispatchStatus: undefined,
  sortBy: "appliedAt",
  sortDir: "desc",
}

const PAGE_SIZE = 20

export default function AdminApplicationsPage() {
  const [apps, setApps] = useState<AdminApplication[]>([])
  const [stats, setStats] = useState<AdminApplicationStats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search)
      setPage(1)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [filters.search])

  const fetchApps = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      })
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (filters.status) params.set("status", filters.status)
      if (filters.dispatchStatus) params.set("dispatchStatus", filters.dispatchStatus)

      const res = await fetch(`/api/admin/applications?${params}`)
      const json = await res.json()
      if (json.success) {
        setApps(json.data)
        setTotal(json.meta.total)
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, filters.status, filters.dispatchStatus, filters.sortBy, filters.sortDir])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/applications/stats")
      const json = await res.json()
      if (json.success) setStats(json.data)
    } catch (err) {
      console.error("Failed to fetch stats:", err)
    }
  }, [])

  useEffect(() => {
    fetchApps()
  }, [fetchApps])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Reset page when non-search filters change
  function handleFilterChange(next: Filters) {
    const searchChanged = next.search !== filters.search
    setFilters(next)
    if (!searchChanged) setPage(1)
  }

  function handleSort(col: "appliedAt" | "updatedAt" | "status") {
    setFilters((prev) => ({
      ...prev,
      sortBy: col,
      sortDir: prev.sortBy === col && prev.sortDir === "desc" ? "asc" : "desc",
    }))
    setPage(1)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected = apps.every((a) => prev.has(a.id))
      if (allSelected) {
        const next = new Set(prev)
        apps.forEach((a) => next.delete(a.id))
        return next
      }
      const next = new Set(prev)
      apps.forEach((a) => next.add(a.id))
      return next
    })
  }

  async function retryFailedDispatches() {
    const failed = apps.filter(
      (a) => selectedIds.has(a.id) && a.dispatchStatus === "FAILED"
    )
    if (failed.length === 0) return
    setBulkLoading(true)
    try {
      await Promise.all(
        failed.map((a) =>
          fetch(`/api/admin/applications/${a.id}/retry-dispatch`, { method: "POST" })
        )
      )
      setSelectedIds(new Set())
      fetchApps()
      fetchStats()
    } catch (err) {
      console.error("Bulk retry failed:", err)
    } finally {
      setBulkLoading(false)
    }
  }

  async function exportCsv() {
    setBulkLoading(true)
    try {
      const res = await fetch("/api/admin/applications/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "applications.csv"
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Export failed:", err)
    } finally {
      setBulkLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const failedSelectedCount = apps.filter(
    (a) => selectedIds.has(a.id) && a.dispatchStatus === "FAILED"
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-zinc-400 text-sm mt-1">{total} total applications</p>
        </div>
      </div>

      <ApplicationStatsCards stats={stats} />

      <ApplicationFilters filters={filters} onChange={handleFilterChange} />

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3">
          <span className="text-sm text-zinc-300 font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {failedSelectedCount > 0 && (
              <button
                onClick={retryFailedDispatches}
                disabled={bulkLoading}
                className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
              >
                Retry Failed Dispatches ({failedSelectedCount})
              </button>
            )}
            <button
              onClick={exportCsv}
              disabled={bulkLoading}
              className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <ApplicationsTable
        applications={apps}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onSort={handleSort}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir as "asc" | "desc"}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
