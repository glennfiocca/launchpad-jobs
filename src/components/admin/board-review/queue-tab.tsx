"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ExternalLink, CheckCircle2, XCircle, Pause, SkipForward } from "lucide-react"
import { useNextCard } from "./use-next-card"
import { BoardLogo } from "./board-logo"
import { ShortcutLegend } from "./shortcut-legend"
import type { ApiResponse } from "@/types"
import type { QueueCard } from "@/lib/board-review/types"
import type { ReviewStatus } from "@prisma/client"

const SHORTCUTS = [
  { key: "A", label: "Approve" },
  { key: "R", label: "Reject" },
  { key: "N", label: "Needs review" },
  { key: "S", label: "Skip" },
]

type ActionKey = "APPROVED" | "NEEDS_REVIEW" | "REJECTED" | "SKIP"

/**
 * Tab body for the board-review Queue. Renders one card at a time and
 * advances on every action. Notes are persisted on the *currently
 * displayed* card so the textarea content survives the round-trip but is
 * cleared the moment we render the next card.
 */
export function QueueTab() {
  const { card, loading, error, fetchNext, reviewedSinceMount, incrementReviewed } =
    useNextCard("queue")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState<ActionKey | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Reset the per-card scratch state whenever the card actually changes.
  // Tied to the id specifically — re-renders that yield the same card id
  // (e.g. parent re-mount) should NOT wipe in-progress notes.
  useEffect(() => {
    setNotes("")
    setActionError(null)
  }, [card?.id])

  // Card might be a MissCard if the hook is misused — narrow defensively.
  const queueCard: QueueCard | null = card && card.kind === "board" ? card : null

  const handleAction = useCallback(
    async (action: ActionKey) => {
      if (!queueCard || busy) return
      setBusy(action)
      setActionError(null)
      try {
        if (action === "SKIP") {
          const res = await fetch(`/api/admin/board-review/${queueCard.id}/action`, {
            method: "PATCH",
          })
          const json: ApiResponse<{ id: string }> = await res.json()
          if (!json.success) throw new Error(json.error ?? "Skip failed")
        } else {
          const status: ReviewStatus = action
          const res = await fetch(`/api/admin/board-review/${queueCard.id}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, notes: notes || undefined }),
          })
          const json: ApiResponse<unknown> = await res.json()
          if (!json.success) throw new Error(json.error ?? "Action failed")
          incrementReviewed()
        }
        await fetchNext()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed"
        setActionError(message)
      } finally {
        setBusy(null)
      }
    },
    [queueCard, busy, notes, fetchNext, incrementReviewed]
  )

  // Global keyboard shortcuts. Suppressed while focus is inside the
  // textarea so typing notes doesn't fire actions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === "a") void handleAction("APPROVED")
      else if (k === "r") void handleAction("REJECTED")
      else if (k === "n") void handleAction("NEEDS_REVIEW")
      else if (k === "s") void handleAction("SKIP")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleAction])

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading next card...</div>
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        {error}
      </div>
    )
  }

  if (!queueCard) {
    return (
      <div className="p-10 rounded-xl border border-zinc-800 bg-zinc-900 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <p className="text-white font-semibold mt-3">All caught up.</p>
        <p className="text-zinc-500 text-sm mt-1">
          You reviewed {reviewedSinceMount} board{reviewedSinceMount === 1 ? "" : "s"} this session.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {queueCard.reviewStatus === "REJECTED" && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-200 text-sm">
          <span className="font-medium">Previously rejected.</span> Re-enabling this board should be
          done deliberately — confirm the board token still resolves to the intended company before
          approving.
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <Header card={queueCard} />
        <MetaGrid card={queueCard} />
        <SampleJobBlock card={queueCard} />
        <LinksRow card={queueCard} />
        <div>
          <label htmlFor="reviewer-notes" className="block text-xs text-zinc-400 mb-1">
            Reviewer notes (optional)
          </label>
          <textarea
            id="reviewer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            placeholder="Anything worth recording..."
          />
        </div>
        {actionError && (
          <div className="text-xs text-red-400">{actionError}</div>
        )}
        <ActionButtons busy={busy} onAction={handleAction} />
      </div>

      <ShortcutLegend items={SHORTCUTS} />
    </div>
  )
}

function Header({ card }: { card: QueueCard }) {
  return (
    <div className="flex items-start gap-5">
      <BoardLogo logoUrl={card.companyLogoUrl} name={card.companyName ?? card.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-white truncate">
            {card.companyName ?? card.name}
          </h2>
          {card.companyLogoSource && (
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              logo: {card.companyLogoSource}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-zinc-500">
          <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-mono">
            {card.boardToken}
          </code>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{card.provider}</span>
          {card.suspiciousSlug && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30"
              title="Short slug + low active job count — heightened risk of resolving to the wrong company."
            >
              <AlertTriangle className="w-3 h-3" />
              suspicious slug
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaGrid({ card }: { card: QueueCard }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
      <Stat label="Active jobs" value={card.activeJobCount.toString()} />
      <Stat label="Hosting" value={card.hosting} />
      <Stat label="Apply hostname" value={card.applyHostname ?? "—"} />
      <Stat
        label="Last sync"
        value={card.lastSyncAt ? new Date(card.lastSyncAt).toLocaleString() : "—"}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-zinc-800 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-zinc-200 mt-0.5 truncate" title={value}>{value}</p>
    </div>
  )
}

function SampleJobBlock({ card }: { card: QueueCard }) {
  if (!card.sampleJob) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 text-xs text-zinc-500">
        No active job found for this board.
      </div>
    )
  }
  const job = card.sampleJob
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">Most recent active job</p>
      <p className="text-sm text-white">{job.title}</p>
      {job.location && <p className="text-xs text-zinc-400">{job.location}</p>}
      <div className="flex flex-wrap gap-3 pt-1 text-xs">
        {job.absoluteUrl && (
          <a
            href={job.absoluteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            absoluteUrl <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {job.applyUrl && job.applyUrl !== job.absoluteUrl && (
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            applyUrl <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  )
}

function LinksRow({ card }: { card: QueueCard }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs">
      <a
        href={card.rawApiUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
      >
        Raw API <ExternalLink className="w-3 h-3" />
      </a>
      <a
        href={card.canonicalBoardUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
      >
        Canonical board page <ExternalLink className="w-3 h-3" />
      </a>
      {card.companyWebsite && (
        <a
          href={card.companyWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
        >
          Company site <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

function ActionButtons({
  busy,
  onAction,
}: {
  busy: ActionKey | null
  onAction: (a: ActionKey) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
      <ActionButton
        variant="approve"
        icon={<CheckCircle2 className="w-4 h-4" />}
        label="Approve"
        shortcut="A"
        busy={busy === "APPROVED"}
        disabled={busy !== null}
        onClick={() => onAction("APPROVED")}
      />
      <ActionButton
        variant="needs-review"
        icon={<Pause className="w-4 h-4" />}
        label="Needs further review"
        shortcut="N"
        busy={busy === "NEEDS_REVIEW"}
        disabled={busy !== null}
        onClick={() => onAction("NEEDS_REVIEW")}
      />
      <ActionButton
        variant="reject"
        icon={<XCircle className="w-4 h-4" />}
        label="Reject"
        shortcut="R"
        busy={busy === "REJECTED"}
        disabled={busy !== null}
        onClick={() => onAction("REJECTED")}
      />
      <ActionButton
        variant="skip"
        icon={<SkipForward className="w-4 h-4" />}
        label="Skip for now"
        shortcut="S"
        busy={busy === "SKIP"}
        disabled={busy !== null}
        onClick={() => onAction("SKIP")}
      />
    </div>
  )
}

interface ActionButtonProps {
  variant: "approve" | "needs-review" | "reject" | "skip"
  icon: React.ReactNode
  label: string
  shortcut: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}

const VARIANT_STYLES: Record<ActionButtonProps["variant"], string> = {
  approve: "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500",
  "needs-review": "bg-amber-600 hover:bg-amber-500 text-white border-amber-500",
  reject: "bg-red-600 hover:bg-red-500 text-white border-red-500",
  skip: "bg-zinc-700 hover:bg-zinc-600 text-zinc-100 border-zinc-600",
}

function ActionButton({ variant, icon, label, shortcut, busy, disabled, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50",
        VARIANT_STYLES[variant],
      ].join(" ")}
    >
      {icon}
      <span>{busy ? "..." : label}</span>
      <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
        {shortcut}
      </kbd>
    </button>
  )
}
