"use client"

/**
 * Admin: Logo Overrides — Track B.4 of HARDENING_PLAN.md.
 *
 * Edits the `CompanyLogoOverride` table directly. Changes invalidate the
 * resolver's in-process cache server-side; client-side, we re-fetch the
 * list after every mutation.
 *
 * Mirrors the structure of /admin/companies — same modal pattern, same
 * Tailwind tokens, same submit/loading semantics.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, Pencil, Trash2, ImageOff } from "lucide-react"
import type { CompanyLogoOverride, AtsProvider } from "@prisma/client"

interface OverrideForm {
  provider: AtsProvider
  slug: string
  website: string
  logoUrl: string
  notes: string
}

const emptyForm: OverrideForm = {
  provider: "GREENHOUSE",
  slug: "",
  website: "",
  logoUrl: "",
  notes: "",
}

export default function AdminLogoOverridesPage() {
  const [rows, setRows] = useState<CompanyLogoOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<OverrideForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const fetchRows = useCallback(async () => {
    setLoading(true)
    // Fetch up to 500 — over that, server-side filtering is needed; the
    // table currently sits at ~120 entries so client-side is fine.
    const res = await fetch("/api/admin/logo-overrides?page=1&limit=500")
    const json = await res.json()
    if (json.success) setRows(json.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      r.slug.toLowerCase().includes(q) ||
      (r.website ?? "").toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q)
    )
  }, [rows, search])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(row: CompanyLogoOverride) {
    setEditingId(row.id)
    setForm({
      provider: row.provider,
      slug: row.slug,
      website: row.website ?? "",
      logoUrl: row.logoUrl ?? "",
      notes: row.notes ?? "",
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const url = editingId ? `/api/admin/logo-overrides/${editingId}` : "/api/admin/logo-overrides"
    const method = editingId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (json.success) {
      setModalOpen(false)
      fetchRows()
    } else {
      alert(json.error ?? "Failed to save override")
    }
    setSubmitting(false)
  }

  async function handleDelete(row: CompanyLogoOverride) {
    if (!confirm(`Delete override for "${row.provider}:${row.slug}"? This cannot be undone.`)) return
    setActionLoading(`delete-${row.id}`)
    const res = await fetch(`/api/admin/logo-overrides/${row.id}`, { method: "DELETE" })
    const json = await res.json()
    if (json.success) fetchRows()
    else alert(json.error ?? "Failed to delete override")
    setActionLoading(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Logo Overrides</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {rows.length} curated entries — DB-backed runtime source of truth
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search slug / website / notes..."
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500 w-64"
          />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Override
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium w-20">Logo</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Provider</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Slug</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Website</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Notes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Loading...</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                {rows.length === 0 ? "No overrides. Run db:seed-overrides or add one." : "No matches."}
              </td></tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <LogoCell logoUrl={row.logoUrl} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{row.provider}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{row.slug}</code>
                  </td>
                  <td className="px-4 py-3">
                    {row.website ? (
                      <a href={row.website} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:underline">
                        {row.website}
                      </a>
                    ) : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-xs truncate" title={row.notes ?? ""}>
                    {row.notes ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(row)} className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        disabled={actionLoading === `delete-${row.id}`}
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
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? "Edit Override" : "Add Override"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Provider *</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as AtsProvider }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="GREENHOUSE">GREENHOUSE</option>
                  <option value="ASHBY">ASHBY</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="e.g. astronomer (normalized, no provider prefix)"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="https://img.logo.dev/..."
                />
                <LogoPreview logoUrl={form.logoUrl} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                  placeholder="Why this override exists..."
                />
              </div>
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

// Render the curated logo URL with a graceful "no image" fallback. Using
// next/image would force a remotePatterns config for every override host,
// so plain <img> with onError is pragmatic here.
function LogoCell({ logoUrl }: { logoUrl: string | null }) {
  const [errored, setErrored] = useState(false)
  if (!logoUrl || errored) {
    return (
      <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-600">
        <ImageOff className="w-4 h-4" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt="logo preview"
      className="w-10 h-10 rounded bg-zinc-800 object-contain"
      onError={() => setErrored(true)}
    />
  )
}

function LogoPreview({ logoUrl }: { logoUrl: string }) {
  const trimmed = logoUrl.trim()
  if (!trimmed) return null
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
      <span>Preview:</span>
      <LogoCell logoUrl={trimmed} />
    </div>
  )
}

