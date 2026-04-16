"use client"

import { useState } from "react"
import type { AdminApplicationDetail } from "@/types"
import type { ApplicationStatus } from "@/types"
import { STATUS_CONFIG } from "@/types"
import { ApplicationStatusBadge } from "./application-status-badge"
import { DispatchStatusBadge } from "./dispatch-status-badge"
import { RetryDispatchButton } from "./retry-dispatch-button"
import { EmailThreadViewer } from "./email-thread-viewer"
import { StatusHistoryTimeline } from "./status-history-timeline"

interface Props {
  application: AdminApplicationDetail
}

type Tab = "emails" | "timeline"
const APPLICATION_STATUSES = Object.keys(STATUS_CONFIG) as ApplicationStatus[]

export function ApplicationDetail({ application }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("emails")
  const [statusOverride, setStatusOverride] = useState<ApplicationStatus>(application.status)
  const [statusReason, setStatusReason] = useState("")
  const [notes, setNotes] = useState(application.userNotes ?? "")
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [notesMsg, setNotesMsg] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)

  async function saveStatusOverride() {
    setSavingStatus(true)
    setStatusMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusOverride, reason: statusReason || undefined }),
      })
      const json = await res.json()
      if (json.success) {
        setStatusMsg("Status updated.")
        setStatusReason("")
      } else {
        setStatusMsg(json.error ?? "Failed to update status.")
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setSavingStatus(false)
    }
  }

  async function saveNotes() {
    setSavingNotes(true)
    setNotesMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userNotes: notes }),
      })
      const json = await res.json()
      setNotesMsg(json.success ? "Notes saved." : (json.error ?? "Failed to save notes."))
    } catch (err) {
      setNotesMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          {application.job.company.name} — {application.job.title}
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {application.user.name ?? application.user.email} &middot;{" "}
          Applied {new Date(application.appliedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-3">
        <ApplicationStatusBadge status={application.status} />
        <DispatchStatusBadge status={application.dispatchStatus} />
        {application.externalApplicationId && (
          <span className="font-mono text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
            ext: {application.externalApplicationId}
          </span>
        )}
      </div>

      {/* Tracking email */}
      {application.trackingEmail && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Tracking Email</p>
          <p className="font-mono text-sm text-zinc-300">{application.trackingEmail}</p>
        </div>
      )}

      {/* Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
        {/* Retry dispatch — hidden when already dispatched */}
        {!application.externalApplicationId && (
          <div>
            <p className="text-sm text-zinc-400 mb-2 font-medium">Dispatch</p>
            <RetryDispatchButton
              applicationId={application.id}
              disabled={application.dispatchStatus === "DISPATCHED"}
              onSuccess={() => setRetryError(null)}
              onError={(msg) => setRetryError(msg)}
            />
            {retryError && (
              <p className="text-xs text-red-400 mt-2">{retryError}</p>
            )}
          </div>
        )}

        {/* Status override */}
        <div>
          <p className="text-sm text-zinc-400 mb-2 font-medium">Override Status</p>
          <div className="flex flex-wrap items-start gap-2">
            <select
              value={statusOverride}
              onChange={(e) => setStatusOverride(e.target.value as ApplicationStatus)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              onClick={saveStatusOverride}
              disabled={savingStatus || statusOverride === application.status}
              className="px-3 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
            >
              {savingStatus ? "Saving..." : "Save"}
            </button>
          </div>
          {statusMsg && (
            <p className="text-xs text-zinc-400 mt-1.5">{statusMsg}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-sm text-zinc-400 mb-2 font-medium">Admin Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes about this application..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-50 transition-colors"
            >
              {savingNotes ? "Saving..." : "Save Notes"}
            </button>
            {notesMsg && (
              <p className="text-xs text-zinc-400">{notesMsg}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-zinc-800 mb-4">
          {(["emails", "timeline"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab
                  ? "text-violet-400 border-violet-400"
                  : "text-zinc-400 border-transparent hover:text-white",
              ].join(" ")}
            >
              {tab === "emails" ? `Email Thread (${application.emails.length})` : "Status Timeline"}
            </button>
          ))}
        </div>

        {activeTab === "emails" ? (
          <EmailThreadViewer emails={application.emails} />
        ) : (
          <StatusHistoryTimeline history={application.statusHistory} />
        )}
      </div>
    </div>
  )
}
