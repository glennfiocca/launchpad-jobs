"use client"

import { useState } from "react"
import type { AdminApplicationDetail } from "@/types/admin"
import type { PendingQuestion } from "@/types"

interface Props {
  application: AdminApplicationDetail
  currentUserId: string
}

export function OperatorQueueSection({ application, currentUserId }: Props) {
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [fetchingPackage, setFetchingPackage] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Complete modal state
  const [showComplete, setShowComplete] = useState(false)
  const [completeExtId, setCompleteExtId] = useState("")
  const [completeNotes, setCompleteNotes] = useState("")
  const [completing, setCompleting] = useState(false)

  // Fail modal state
  const [showFail, setShowFail] = useState(false)
  const [failReason, setFailReason] = useState("")
  const [failing, setFailing] = useState(false)

  const isClaimed = !!application.claimedByUserId
  const isClaimedByMe = application.claimedByUserId === currentUserId
  const snapshot = application.applicationSnapshot as Record<string, string> | null
  const provider = application.job.provider ?? "GREENHOUSE"
  const providerLabel = provider === "ASHBY" ? "Ashby" : "Greenhouse"

  async function handleClaim() {
    setClaiming(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}/claim`, { method: "POST" })
      const json = await res.json()
      if (!json.success) setMsg(json.error ?? "Failed to claim")
      else window.location.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setClaiming(false)
    }
  }

  async function handleRelease() {
    setReleasing(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}/release`, { method: "POST" })
      const json = await res.json()
      if (!json.success) setMsg(json.error ?? "Failed to release")
      else window.location.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setReleasing(false)
    }
  }

  async function handleFillPackage() {
    setFetchingPackage(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}/fill-package`, { method: "POST" })
      const json = await res.json()
      if (!json.success) {
        setMsg(json.error ?? "Failed to generate fill package")
        return
      }
      const { token } = json.data as { token: string }
      // Prefer the embed URL — it always renders the form directly, unlike the
      // detail page which may require an extra click-through on some boards.
      const boardToken = snapshot?.boardToken
      const externalId = snapshot?.externalId
      const atsUrl = provider === "ASHBY"
        ? (boardToken && externalId
          ? `https://jobs.ashbyhq.com/${encodeURIComponent(boardToken)}/${encodeURIComponent(externalId)}/application`
          : snapshot?.manualApplyUrl)
        : (boardToken && externalId
          ? `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(boardToken)}&token=${encodeURIComponent(externalId)}`
          : snapshot?.manualApplyUrl)
      if (!atsUrl) {
        setMsg(`No ${providerLabel} URL in snapshot — cannot open prefilled form.`)
        return
      }
      // Pass the token in the URL hash — avoids unreliable cross-origin
      // window.opener postMessage. Hash is never sent to the ATS server.
      const fillUrl = `${atsUrl}#pipelineFill=${encodeURIComponent(token)}`
      const tab = window.open(fillUrl, "_blank")
      if (!tab) {
        setMsg("Popup blocked — allow popups for this site and try again.")
        return
      }

      // Keep postMessage as a fallback for manual extension usage
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "PIPELINE_REQUEST_TOKEN") {
          event.source?.postMessage({ type: "PIPELINE_FILL", token }, { targetOrigin: "*" })
          window.removeEventListener("message", handleMessage)
        }
      }
      window.addEventListener("message", handleMessage)
      setTimeout(() => window.removeEventListener("message", handleMessage), 120_000)

      setMsg(`${providerLabel} tab opened — extension will pre-fill once the page loads.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setFetchingPackage(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}/operator-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalApplicationId: completeExtId || undefined,
          notes: completeNotes || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) setMsg(json.error ?? "Failed to mark complete")
      else window.location.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setCompleting(false)
    }
  }

  async function handleFail() {
    if (!failReason.trim()) {
      setMsg("Reason is required")
      return
    }
    setFailing(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/applications/${application.id}/operator-fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: failReason }),
      })
      const json = await res.json()
      if (!json.success) setMsg(json.error ?? "Failed to mark as failed")
      else window.location.reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Request failed")
    } finally {
      setFailing(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-orange-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-orange-400 text-base">⏳</span>
        <p className="text-orange-300 text-sm font-semibold">Operator Queue</p>
        {isClaimed && (
          <span className="ml-auto text-xs text-zinc-400">
            Claimed by {isClaimedByMe ? "you" : (application.claimedBy?.email ?? application.claimedByUserId)}
          </span>
        )}
      </div>

      {/* Snapshot summary */}
      {snapshot && (
        <div className="bg-zinc-800 rounded-lg p-3 space-y-1 text-xs font-mono">
          <p className="text-zinc-400">
            <span className="text-zinc-500">Applicant:</span>{" "}
            {snapshot.firstName} {snapshot.lastName} &lt;{snapshot.email}&gt;
          </p>
          {snapshot.trackingEmail && (
            <p className="text-zinc-400">
              <span className="text-zinc-500">Tracking email:</span> {snapshot.trackingEmail}
            </p>
          )}
          <p className="text-zinc-400">
            <span className="text-zinc-500">Board / Job ID:</span> {snapshot.boardToken} / {snapshot.externalId}
          </p>
          {snapshot.manualApplyUrl && (
            <p className="text-zinc-400 truncate">
              <span className="text-zinc-500">URL:</span>{" "}
              <a href={snapshot.manualApplyUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
                {snapshot.manualApplyUrl}
              </a>
            </p>
          )}
          {snapshot.resumeFileName && (
            <p className="text-zinc-400">
              <span className="text-zinc-500">Resume:</span> {snapshot.resumeFileName}
            </p>
          )}
        </div>
      )}

      {/* Pending Questions */}
      {snapshot && Array.isArray((snapshot as Record<string, unknown>).pendingQuestions) &&
        ((snapshot as Record<string, unknown>).pendingQuestions as PendingQuestion[]).length > 0 && (
        (() => {
          const pending = (snapshot as Record<string, unknown>).pendingQuestions as PendingQuestion[]
          const unanswered = pending.filter((q) => q.required && !q.userAnswer)
          const answered = pending.filter((q) => !!q.userAnswer)
          return (
            <div className="bg-zinc-800 rounded-lg p-3 space-y-2 text-xs">
              <p className="font-semibold text-amber-400">
                Pending questions — {unanswered.length} unanswered / {answered.length} answered
              </p>
              <ul className="space-y-1 font-mono">
                {pending.map((q) => (
                  <li key={q.fieldName} className="flex items-start gap-2">
                    <span className={q.userAnswer ? "text-green-400" : "text-amber-500"}>
                      {q.userAnswer ? "✓" : "○"}
                    </span>
                    <span className="text-zinc-300 flex-1">{q.label}</span>
                    {q.required && !q.userAnswer && (
                      <span className="text-red-400 text-[10px] shrink-0">required</span>
                    )}
                    {q.userAnswer && (
                      <span className="text-zinc-500 truncate max-w-[180px]">{q.userAnswer}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })()
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isClaimed && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {claiming ? "Claiming..." : "Claim"}
          </button>
        )}
        {isClaimedByMe && (
          <button
            onClick={handleRelease}
            disabled={releasing}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-50 transition-colors"
          >
            {releasing ? "Releasing..." : "Release"}
          </button>
        )}

        <button
          onClick={handleFillPackage}
          disabled={fetchingPackage}
          className="px-3 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          {fetchingPackage ? "Generating..." : `Open ${providerLabel} (prefilled)`}
        </button>

        <button
          onClick={() => setShowComplete(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-green-700 text-white hover:bg-green-600 transition-colors"
        >
          Mark Submitted
        </button>

        <button
          onClick={() => setShowFail(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-red-800 text-white hover:bg-red-700 transition-colors"
        >
          Mark Failed
        </button>
      </div>

      {msg && <p className="text-xs text-amber-400">{msg}</p>}

      {/* Complete modal */}
      {showComplete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold">Mark as Submitted</h2>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">External Application ID (optional)</label>
              <input
                value={completeExtId}
                onChange={(e) => setCompleteExtId(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Notes (optional)</label>
              <textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleComplete}
                disabled={completing}
                className="px-4 py-2 text-sm rounded-lg bg-green-700 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {completing ? "Saving..." : "Confirm Submitted"}
              </button>
              <button
                onClick={() => setShowComplete(false)}
                className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fail modal */}
      {showFail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold">Mark as Failed</h2>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Reason (required)</label>
              <textarea
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                rows={3}
                placeholder="Describe why the application could not be submitted..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFail}
                disabled={failing}
                className="px-4 py-2 text-sm rounded-lg bg-red-700 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {failing ? "Saving..." : "Confirm Failed"}
              </button>
              <button
                onClick={() => setShowFail(false)}
                className="px-4 py-2 text-sm rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
