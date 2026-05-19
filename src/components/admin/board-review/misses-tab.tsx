"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, ExternalLink, Search, SkipForward, XCircle, Pause } from "lucide-react"
import { useNextCard } from "./use-next-card"
import { ShortcutLegend } from "./shortcut-legend"
import type { ApiResponse } from "@/types"
import type { MissCard, MissValidateResult } from "@/lib/board-review/types"
import type { AtsProvider } from "@prisma/client"

const SHORTCUTS = [
  { key: "V", label: "Validate" },
  { key: "A", label: "Approve" },
  { key: "R", label: "Reject" },
  { key: "N", label: "Needs review" },
  { key: "S", label: "Skip" },
]

type MissAction = "RESOLVE" | "REJECT" | "NEEDS_REVIEW" | "SKIP" | "VALIDATE"

interface FormState {
  slug: string
  ats: AtsProvider
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]*$/i

/**
 * Tab body for unresolved-company review. Walks through each
 * `BoardReviewMiss` one at a time. The reviewer pastes a slug + picks an
 * ATS; we live-probe the board against the public API; on success they
 * Save & Approve (promotes the miss to a CompanyBoard).
 */
export function MissesTab() {
  const { card, loading, error, fetchNext, reviewedSinceMount, incrementReviewed } =
    useNextCard("misses")
  const [form, setForm] = useState<FormState>({ slug: "", ats: "GREENHOUSE" })
  const [validateResult, setValidateResult] = useState<MissValidateResult | null>(null)
  const [busy, setBusy] = useState<MissAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const missCard: MissCard | null = card && card.kind === "miss" ? card : null

  // Reset per-card scratch state when the displayed card changes.
  useEffect(() => {
    setForm({ slug: "", ats: "GREENHOUSE" })
    setValidateResult(null)
    setActionError(null)
  }, [missCard?.id])

  const slugLooksValid = useMemo(
    () => form.slug.trim().length > 0 && SLUG_REGEX.test(form.slug.trim()),
    [form.slug]
  )

  const canSave = validateResult?.ok === true

  const validate = useCallback(async () => {
    if (!missCard || !slugLooksValid || busy) return
    setBusy("VALIDATE")
    setActionError(null)
    setValidateResult(null)
    try {
      const res = await fetch("/api/admin/board-review/miss/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: form.slug.trim(), ats: form.ats }),
      })
      const json: ApiResponse<MissValidateResult> = await res.json()
      if (!json.success || !json.data) {
        throw new Error(json.error ?? "Validation request failed")
      }
      setValidateResult(json.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validation failed"
      setActionError(message)
    } finally {
      setBusy(null)
    }
  }, [missCard, slugLooksValid, busy, form])

  const handleAction = useCallback(
    async (action: MissAction) => {
      if (!missCard || busy) return

      if (action === "VALIDATE") {
        await validate()
        return
      }

      if (action === "SKIP") {
        setBusy("SKIP")
        try {
          await fetch(`/api/admin/board-review/miss/${missCard.id}/action`, { method: "PATCH" })
          await fetchNext()
        } finally {
          setBusy(null)
        }
        return
      }

      setBusy(action)
      setActionError(null)
      try {
        if (action === "RESOLVE") {
          if (!canSave) throw new Error("Validate the slug first")
          const res = await fetch(`/api/admin/board-review/miss/${missCard.id}/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: form.slug.trim(), ats: form.ats }),
          })
          const json: ApiResponse<unknown> = await res.json()
          if (!json.success) throw new Error(json.error ?? "Resolve failed")
        } else {
          const status = action === "REJECT" ? "REJECTED" : "NEEDS_REVIEW"
          const res = await fetch(`/api/admin/board-review/miss/${missCard.id}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
          const json: ApiResponse<unknown> = await res.json()
          if (!json.success) throw new Error(json.error ?? "Action failed")
        }
        incrementReviewed()
        await fetchNext()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed"
        setActionError(message)
      } finally {
        setBusy(null)
      }
    },
    [missCard, busy, validate, fetchNext, form, canSave, incrementReviewed]
  )

  // Keyboard shortcuts — same gating rules as the queue tab (no
  // firing while typing in inputs/textareas).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT")
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === "v") void handleAction("VALIDATE")
      else if (k === "a" && canSave) void handleAction("RESOLVE")
      else if (k === "r") void handleAction("REJECT")
      else if (k === "n") void handleAction("NEEDS_REVIEW")
      else if (k === "s") void handleAction("SKIP")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handleAction, canSave])

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">Loading next miss...</div>
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        {error}
      </div>
    )
  }

  if (!missCard) {
    return (
      <div className="p-10 rounded-xl border border-zinc-800 bg-zinc-900 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <p className="text-white font-semibold mt-3">All caught up.</p>
        <p className="text-zinc-500 text-sm mt-1">
          You reviewed {reviewedSinceMount} miss{reviewedSinceMount === 1 ? "" : "es"} this session.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
        <MissHeader card={missCard} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <Stat label="Country" value={missCard.countryCode ?? "—"} />
          <Stat label="Total jobs (TS)" value={missCard.totalJobsTs?.toString() ?? "—"} />
          <Stat label="Industry" value={missCard.industry ?? "—"} />
          <Stat label="Status" value={missCard.reviewStatus} />
        </div>

        {missCard.candidatesTried && (
          <details className="rounded-lg border border-zinc-800 bg-zinc-800/30 px-4 py-2 text-xs text-zinc-400">
            <summary className="cursor-pointer text-zinc-300">Candidates tried</summary>
            <pre className="mt-2 whitespace-pre-wrap text-zinc-400 font-mono text-[11px]">
              {missCard.candidatesTried}
            </pre>
          </details>
        )}

        <ResolveForm
          form={form}
          setForm={setForm}
          slugLooksValid={slugLooksValid}
          validateResult={validateResult}
          busy={busy}
          onValidate={() => handleAction("VALIDATE")}
        />

        {actionError && <div className="text-xs text-red-400">{actionError}</div>}

        <MissActionButtons
          busy={busy}
          canSave={canSave}
          onAction={handleAction}
        />
      </div>

      <ShortcutLegend items={SHORTCUTS} />
    </div>
  )
}

function MissHeader({ card }: { card: MissCard }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold text-white">{card.companyName}</h2>
      <div className="flex flex-wrap gap-4 text-xs">
        {card.companyUrl && (
          <a
            href={card.companyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            Website <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {card.linkedinUrl && (
          <a
            href={card.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            LinkedIn <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
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

interface ResolveFormProps {
  form: FormState
  setForm: (updater: (f: FormState) => FormState) => void
  slugLooksValid: boolean
  validateResult: MissValidateResult | null
  busy: MissAction | null
  onValidate: () => void
}

function ResolveForm({
  form,
  setForm,
  slugLooksValid,
  validateResult,
  busy,
  onValidate,
}: ResolveFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <label htmlFor="miss-slug" className="block text-xs text-zinc-400 mb-1">
            Board slug
          </label>
          <input
            id="miss-slug"
            type="text"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="e.g. astronomer"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <span className="block text-xs text-zinc-400 mb-1">ATS</span>
          <div className="flex gap-1 rounded-lg bg-zinc-800 border border-zinc-700 p-1">
            {(["GREENHOUSE", "ASHBY"] as const).map((ats) => (
              <button
                key={ats}
                type="button"
                onClick={() => setForm((f) => ({ ...f, ats }))}
                className={[
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  form.ats === ats
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white",
                ].join(" ")}
              >
                {ats}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onValidate}
          disabled={!slugLooksValid || busy === "VALIDATE"}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-sm font-medium"
        >
          <Search className="w-4 h-4" />
          {busy === "VALIDATE" ? "Probing..." : "Validate"}
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
            V
          </kbd>
        </button>
      </div>

      {validateResult && <ValidateResultPanel result={validateResult} />}
    </div>
  )
}

function ValidateResultPanel({ result }: { result: MissValidateResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
        Validation failed: {result.error ?? "unknown error"}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200 space-y-1">
      <div className="font-medium">
        Found {result.boardName ? <span>&ldquo;{result.boardName}&rdquo;</span> : "board"} with{" "}
        {result.activeJobs ?? 0} active job{result.activeJobs === 1 ? "" : "s"}.
      </div>
      {result.sampleJobTitle && (
        <div className="text-emerald-300/80">
          Sample job: {result.sampleJobTitle}
          {result.sampleJobUrl && (
            <>
              {" — "}
              <a
                href={result.sampleJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                open <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MissActionButtons({
  busy,
  canSave,
  onAction,
}: {
  busy: MissAction | null
  canSave: boolean
  onAction: (a: MissAction) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
      <button
        type="button"
        onClick={() => onAction("RESOLVE")}
        disabled={!canSave || busy !== null}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>{busy === "RESOLVE" ? "..." : "Save & Approve"}</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
          A
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => onAction("NEEDS_REVIEW")}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border bg-amber-600 hover:bg-amber-500 border-amber-500 text-white disabled:opacity-50"
      >
        <Pause className="w-4 h-4" />
        <span>{busy === "NEEDS_REVIEW" ? "..." : "Investigate later"}</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
          N
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => onAction("REJECT")}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border bg-red-600 hover:bg-red-500 border-red-500 text-white disabled:opacity-50"
      >
        <XCircle className="w-4 h-4" />
        <span>{busy === "REJECT" ? "..." : "No public board"}</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
          R
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => onAction("SKIP")}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-100 disabled:opacity-50"
      >
        <SkipForward className="w-4 h-4" />
        <span>{busy === "SKIP" ? "..." : "Skip"}</span>
        <kbd className="ml-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-mono">
          S
        </kbd>
      </button>
    </div>
  )
}
