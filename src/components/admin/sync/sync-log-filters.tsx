"use client"

import { useRouter, usePathname } from "next/navigation"
import { useState } from "react"

// Track D.2 of HARDENING_PLAN.md — filter bar for the admin sync log table.
// Uses URL search params as state so the server component can apply Prisma
// filters during render (no client-side fetching layer needed).

export type SyncStatusFilter = "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE" | "all"
export type ProviderFilter = "GREENHOUSE" | "ASHBY" | "all"

interface SyncLogFiltersValue {
  status: SyncStatusFilter
  provider: ProviderFilter
  fromDate: string
  toDate: string
}

interface Props {
  initial: SyncLogFiltersValue
}

const STATUS_OPTIONS: ReadonlyArray<{ value: SyncStatusFilter; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "SUCCESS", label: "Success" },
  { value: "PARTIAL_FAILURE", label: "Partial Failure" },
  { value: "FAILURE", label: "Failure" },
]

const PROVIDER_OPTIONS: ReadonlyArray<{ value: ProviderFilter; label: string }> = [
  { value: "all", label: "All Providers" },
  { value: "GREENHOUSE", label: "Greenhouse" },
  { value: "ASHBY", label: "Ashby" },
]

const EMPTY: SyncLogFiltersValue = {
  status: "all",
  provider: "all",
  fromDate: "",
  toDate: "",
}

export function SyncLogFilters({ initial }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState<SyncLogFiltersValue>(initial)

  function apply(next: SyncLogFiltersValue) {
    const params = new URLSearchParams()
    if (next.status !== "all") params.set("status", next.status)
    if (next.provider !== "all") params.set("provider", next.provider)
    if (next.fromDate) params.set("fromDate", next.fromDate)
    if (next.toDate) params.set("toDate", next.toDate)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    apply(value)
  }

  function handleClear() {
    setValue(EMPTY)
    apply(EMPTY)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="sync-status" className="text-xs text-zinc-400">
          Status
        </label>
        <select
          id="sync-status"
          value={value.status}
          onChange={(e) =>
            setValue((v) => ({ ...v, status: e.target.value as SyncStatusFilter }))
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sync-provider" className="text-xs text-zinc-400">
          Provider
        </label>
        <select
          id="sync-provider"
          value={value.provider}
          onChange={(e) =>
            setValue((v) => ({ ...v, provider: e.target.value as ProviderFilter }))
          }
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sync-from" className="text-xs text-zinc-400">
          From
        </label>
        <input
          id="sync-from"
          type="date"
          value={value.fromDate}
          onChange={(e) => setValue((v) => ({ ...v, fromDate: e.target.value }))}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sync-to" className="text-xs text-zinc-400">
          To
        </label>
        <input
          id="sync-to"
          type="date"
          value={value.toDate}
          onChange={(e) => setValue((v) => ({ ...v, toDate: e.target.value }))}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:text-white hover:bg-zinc-700 transition-colors"
        >
          Clear
        </button>
      </div>
    </form>
  )
}
