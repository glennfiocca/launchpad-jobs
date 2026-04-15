"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import type { AdminCompanyBoard } from "@/types"

interface BoardForm {
  name: string
  boardToken: string
  logoUrl: string
  website: string
}

const emptyForm: BoardForm = { name: "", boardToken: "", logoUrl: "", website: "" }

export default function AdminCompaniesPage() {
  const [boards, setBoards] = useState<AdminCompanyBoard[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<BoardForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchBoards = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/companies")
    const json = await res.json()
    if (json.success) setBoards(json.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchBoards() }, [fetchBoards])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(board: AdminCompanyBoard) {
    setEditingId(board.id)
    setForm({
      name: board.name,
      boardToken: board.boardToken,
      logoUrl: board.logoUrl ?? "",
      website: board.website ?? "",
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const url = editingId ? `/api/admin/companies/${editingId}` : "/api/admin/companies"
    const method = editingId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (json.success) {
      setModalOpen(false)
      fetchBoards()
    } else {
      alert(json.error ?? "Failed to save board")
    }
    setSubmitting(false)
  }

  async function handleDelete(board: AdminCompanyBoard) {
    if (!confirm(`Delete board "${board.name}"? This cannot be undone.`)) return
    setActionLoading(`delete-${board.id}`)
    const res = await fetch(`/api/admin/companies/${board.id}`, { method: "DELETE" })
    const json = await res.json()
    if (json.success) fetchBoards()
    else alert(json.error ?? "Failed to delete board")
    setActionLoading(null)
  }

  async function toggleActive(board: AdminCompanyBoard) {
    setActionLoading(`toggle-${board.id}`)
    const res = await fetch(`/api/admin/companies/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !board.isActive }),
    })
    const json = await res.json()
    if (json.success) fetchBoards()
    else alert(json.error ?? "Failed to update board")
    setActionLoading(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="text-zinc-400 text-sm mt-1">{boards.length} boards</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Board
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Board Token</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Jobs</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : boards.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-500">No boards. Add one above.</td></tr>
            ) : (
              boards.map((board) => (
                <tr key={board.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white">{board.name}</p>
                    {board.website && <a href={board.website} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:underline">{board.website}</a>}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{board.boardToken}</code>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{board.jobCount}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(board)}
                      disabled={actionLoading === `toggle-${board.id}`}
                      className="flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {board.isActive
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5 text-zinc-600" />}
                      <span className={board.isActive ? "text-green-400 text-xs" : "text-zinc-500 text-xs"}>
                        {board.isActive ? "Active" : "Inactive"}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(board)} className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(board)}
                        disabled={actionLoading === `delete-${board.id}`}
                        className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModalOpen(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? "Edit Board" : "Add Board"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {(["name", "boardToken", "logoUrl", "website"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs text-zinc-400 mb-1 capitalize">
                    {field === "boardToken" ? "Board Token" : field === "logoUrl" ? "Logo URL" : field}
                    {(field === "name" || field === "boardToken") && " *"}
                  </label>
                  <input
                    type={field === "logoUrl" || field === "website" ? "url" : "text"}
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    required={field === "name" || field === "boardToken"}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder={
                      field === "boardToken" ? "e.g. stripe" :
                      field === "logoUrl" ? "https://..." :
                      field === "website" ? "https://..." :
                      ""
                    }
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:text-white hover:border-zinc-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
