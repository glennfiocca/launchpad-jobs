"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import type { AdminJob } from "@/types"

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: "20" })
    if (search) params.set("search", search)
    const res = await fetch(`/api/admin/jobs?${params}`)
    const json = await res.json()
    if (json.success) {
      setJobs(json.data)
      setTotal(json.meta.total)
    }
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  async function toggleActive(job: AdminJob) {
    setActionLoading(job.id)
    const res = await fetch(`/api/admin/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !job.isActive }),
    })
    const json = await res.json()
    if (json.success) fetchJobs()
    else alert(json.error ?? "Failed to update job")
    setActionLoading(null)
  }

  async function triggerSync() {
    if (!confirm("Sync all active boards now? This may take 30–60 seconds.")) return
    setSyncing(true)
    setSyncResult(null)
    const res = await fetch("/api/admin/jobs/sync", { method: "POST" })
    const json = await res.json()
    if (json.success) {
      setSyncResult(`Synced ${json.data.synced}/${json.data.total} boards (${json.data.failed} failed)`)
      fetchJobs()
    } else {
      setSyncResult(`Error: ${json.error}`)
    }
    setSyncing(false)
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-zinc-400 text-sm mt-1">{total} total jobs</p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={["w-4 h-4", syncing ? "animate-spin" : ""].join(" ")} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {syncResult && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-300">
          {syncResult}
        </div>
      )}

      <input
        type="text"
        placeholder="Search by job title..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Job</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Location</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Apps</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Posted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No jobs found.</td></tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white">{job.title}</p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-0.5 tabular-nums">{job.publicJobId}</p>
                    {job.department && <p className="text-zinc-500 text-xs">{job.department}</p>}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{job.company.name}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {job.remote ? "Remote" : job.location ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={["inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", job.isActive ? "bg-green-500/10 text-green-400" : "bg-zinc-700/50 text-zinc-400"].join(" ")}>
                      {job.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{job._count.applications}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {job.postedAt ? new Date(job.postedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(job)}
                      disabled={actionLoading === job.id}
                      className={["text-xs px-2 py-1 rounded transition-colors disabled:opacity-50", job.isActive ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"].join(" ")}
                    >
                      {job.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-50">Previous</button>
          <span className="text-sm text-zinc-400">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  )
}
