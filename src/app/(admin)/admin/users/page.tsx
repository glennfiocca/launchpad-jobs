"use client"

import { useState, useEffect, useCallback } from "react"
import type { AdminUser } from "@/types"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: "20" })
    if (search) params.set("search", search)
    const res = await fetch(`/api/admin/users?${params}`)
    const json = await res.json()
    if (json.success) {
      setUsers(json.data)
      setTotal(json.meta.total)
    }
    setLoading(false)
  }, [page, search])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  async function toggleRole(user: AdminUser) {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN"
    if (
      !confirm(
        `${newRole === "ADMIN" ? "Promote" : "Demote"} ${user.email} to ${newRole}?`
      )
    )
      return
    setActionLoading(user.id)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })
    const json = await res.json()
    if (json.success) {
      fetchUsers()
    } else {
      alert(json.error ?? "Failed to update role")
    }
    setActionLoading(null)
  }

  async function resetCredits(user: AdminUser) {
    if (!confirm(`Reset credits for ${user.email}?`)) return
    setActionLoading(`credits-${user.id}`)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetCredits: true }),
    })
    const json = await res.json()
    if (json.success) {
      fetchUsers()
    } else {
      alert(json.error ?? "Failed to reset credits")
    }
    setActionLoading(null)
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-zinc-400 text-sm mt-1">{total} total users</p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by email or name..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">User</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Subscription</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Credits</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Apps</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white">{user.name ?? "—"}</p>
                    <p className="text-zinc-400 text-xs">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        user.role === "ADMIN"
                          ? "bg-violet-500/10 text-violet-400"
                          : "bg-zinc-700/50 text-zinc-400",
                      ].join(" ")}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                        user.subscriptionStatus === "ACTIVE"
                          ? "bg-green-500/10 text-green-400"
                          : user.subscriptionStatus === "PAST_DUE"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-zinc-700/50 text-zinc-400",
                      ].join(" ")}
                    >
                      {user.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{user.creditsUsed}</td>
                  <td className="px-4 py-3 text-zinc-300">{user._count.applications}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => resetCredits(user)}
                        disabled={actionLoading === `credits-${user.id}`}
                        className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
                      >
                        Reset Credits
                      </button>
                      <button
                        onClick={() => toggleRole(user)}
                        disabled={actionLoading === user.id}
                        className={[
                          "text-xs px-2 py-1 rounded transition-colors disabled:opacity-50",
                          user.role === "ADMIN"
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20",
                        ].join(" ")}
                      >
                        {user.role === "ADMIN" ? "Demote" : "Promote"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
