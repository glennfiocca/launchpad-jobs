"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Play, Loader2, CheckCircle2, AlertTriangle, Info, Building2, Briefcase, Clock } from "lucide-react"
import { StatCard } from "@/components/admin/stat-card"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SourceType = "all" | "companies" | "github" | "careers"
type ProviderType = "all" | "greenhouse" | "ashby"

interface DiscoveryStatus {
  running: boolean
  phase: string
  source: string
  progress: { completed: number; total: number; current: string }
  startedAt: string
  startedBy: string
}

interface DiscoveryBoard {
  token: string
  name: string
  jobCount: number
}

interface DiscoveryResult {
  completedAt: string
  source: string
  startedBy: string
  durationMs: number
  stats: {
    candidatesTested: number
    alreadyKnown: number
    notFound: number
    noActiveJobs: number
    errors: number
    newBoardsFound: number
    totalNewJobs: number
  }
  boards: DiscoveryBoard[]
}

interface PollResponse {
  success: boolean
  data?: {
    status: DiscoveryStatus | null
    lastResult: DiscoveryResult | null
  }
  error?: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_MS = 4_000

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string; description: string }> = [
  {
    value: "all",
    label: "All Sources",
    description: "Run all three discovery methods in sequence. Takes the longest but finds the most boards.",
  },
  {
    value: "companies",
    label: "Company Lists",
    description:
      "Generates slug guesses from S&P 500, Forbes Cloud 100, and Y Combinator company names. Greenhouse only. Fastest source (~5 min).",
  },
  {
    value: "github",
    label: "GitHub Mining",
    description:
      "Searches GitHub code for Greenhouse and Ashby API URLs and extracts board tokens from open-source projects. Highest yield (~10 min).",
  },
  {
    value: "careers",
    label: "Career Pages",
    description:
      "Visits career pages of well-known companies and looks for embedded Greenhouse and Ashby job boards. Catches non-obvious tokens (~3 min).",
  },
]

const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string; description: string }> = [
  {
    value: "all",
    label: "All Providers",
    description: "Discover boards for both Greenhouse and Ashby.",
  },
  {
    value: "greenhouse",
    label: "Greenhouse Only",
    description: "Only discover Greenhouse boards (boards-api.greenhouse.io).",
  },
  {
    value: "ashby",
    label: "Ashby Only",
    description: "Only discover Ashby boards (jobs.ashbyhq.com).",
  },
]

const PHASE_LABELS: Record<string, string> = {
  initializing: "Initializing...",
  loading_existing_tokens: "Loading existing boards from database...",
  company_lists: "Testing company name slugs against ATS APIs...",
  github_mining: "Searching GitHub for board tokens...",
  career_pages: "Crawling company career pages for ATS embeds...",
  ingesting: "Saving new boards to database...",
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DiscoveryPage() {
  const [status, setStatus] = useState<DiscoveryStatus | null>(null)
  const [lastResult, setLastResult] = useState<DiscoveryResult | null>(null)
  const [selectedSource, setSelectedSource] = useState<SourceType>("all")
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>("all")
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ---- Polling ---- */

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/discovery")
      const json: PollResponse = await res.json()
      if (json.success && json.data) {
        setStatus(json.data.status)
        setLastResult(json.data.lastResult)

        // Stop polling once the run completes
        if (!json.data.status?.running) {
          stopPolling()
        }
      }
    } catch {
      // Silently retry on next interval
    }
  }, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [poll, stopPolling])

  // Initial load + cleanup
  useEffect(() => {
    poll().then(() => setLoading(false))
    return () => stopPolling()
  }, [poll, stopPolling])

  // Auto-poll while a run is active
  useEffect(() => {
    if (status?.running) {
      startPolling()
    }
    return () => stopPolling()
  }, [status?.running, startPolling, stopPolling])

  /* ---- Actions ---- */

  async function startDiscovery() {
    setStarting(true)
    setError(null)

    try {
      const res = await fetch("/api/admin/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: selectedSource, provider: selectedProvider, dryRun: false }),
      })
      const json = await res.json()

      if (res.status === 409) {
        setError("A discovery run is already in progress. Wait for it to finish.")
        setStarting(false)
        return
      }

      if (!json.success) {
        setError(json.error ?? "Failed to start discovery")
        setStarting(false)
        return
      }

      setStatus(json.data.status)
      startPolling()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setStarting(false)
    }
  }

  /* ---- Render ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    )
  }

  const isRunning = status?.running ?? false

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Board Discovery</h1>
        <p className="text-zinc-400 mt-1">
          Find new Greenhouse and Ashby job boards to add to the platform
        </p>
      </div>

      {/* Explainer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-violet-400 mt-0.5 shrink-0" />
          <div className="space-y-3 text-sm text-zinc-300">
            <p>
              <span className="text-white font-medium">What this does:</span>{" "}
              This tool automatically searches for companies that use Greenhouse or Ashby as their
              applicant tracking system (ATS) and adds their public job boards to our database.
              Once discovered, their jobs will be pulled in on the next scheduled sync.
            </p>
            <p>
              <span className="text-white font-medium">How it works:</span>{" "}
              Companies using Greenhouse have boards at{" "}
              <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs text-violet-300">
                boards-api.greenhouse.io/v1/boards/&#123;token&#125;
              </code>{" "}
              and Ashby companies at{" "}
              <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs text-violet-300">
                jobs.ashbyhq.com/&#123;token&#125;
              </code>
              . The pipeline mines GitHub for references to these URLs, crawls career pages
              for embedded job boards, and tests company name slugs from S&P 500, Forbes
              Cloud 100, and Y Combinator lists. Each candidate is validated against the
              respective API to confirm it exists and has active job listings before being added.
            </p>
            <p>
              <span className="text-white font-medium">When to run:</span>{" "}
              Run this when you want to expand the job catalog. New companies adopt these
              platforms regularly, so running monthly is a good cadence. Existing boards are
              automatically skipped, so re-running is always safe.
            </p>
          </div>
        </div>
      </div>

      {/* Source Selector + Run Button */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">Start a Discovery Run</h2>

        {/* Provider Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-400">
            ATS Provider
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedProvider(opt.value)}
                disabled={isRunning}
                className={[
                  "text-left p-4 rounded-lg border transition-colors",
                  selectedProvider === opt.value
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
                  isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-medium",
                    selectedProvider === opt.value ? "text-violet-300" : "text-zinc-200",
                  ].join(" ")}
                >
                  {opt.label}
                </p>
                <p className="text-xs text-zinc-500 mt-1">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Source Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-400">
            Discovery source
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedSource(opt.value)}
                disabled={isRunning}
                className={[
                  "text-left p-4 rounded-lg border transition-colors",
                  selectedSource === opt.value
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
                  isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-medium",
                    selectedSource === opt.value ? "text-violet-300" : "text-zinc-200",
                  ].join(" ")}
                >
                  {opt.label}
                </p>
                <p className="text-xs text-zinc-500 mt-1">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={startDiscovery}
          disabled={isRunning || starting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          {starting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {starting ? "Starting..." : isRunning ? "Discovery Running..." : "Run Discovery"}
        </button>
      </div>

      {/* Live Progress */}
      {isRunning && status && (
        <div className="bg-zinc-900 border border-violet-500/30 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
            <h2 className="text-lg font-semibold text-white">Discovery in Progress</h2>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Phase</span>
              <span className="text-zinc-200">{PHASE_LABELS[status.phase] ?? status.phase}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Source</span>
              <span className="text-zinc-200">
                {SOURCE_OPTIONS.find((o) => o.value === status.source)?.label ?? status.source}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Started by</span>
              <span className="text-zinc-200">{status.startedBy}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Started at</span>
              <span className="text-zinc-200">{formatDate(status.startedAt)}</span>
            </div>
          </div>

          {status.progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{status.progress.current}</span>
                <span>
                  {status.progress.completed} / {status.progress.total}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="bg-violet-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (status.progress.completed / status.progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last Result */}
      {lastResult && !isRunning && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Last Discovery Result</h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(lastResult.completedAt)} &middot; {formatDuration(lastResult.durationMs)}
              &middot; by {lastResult.startedBy}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Candidates Tested"
              value={lastResult.stats.candidatesTested.toLocaleString()}
              sub="Total slugs checked against ATS APIs"
            />
            <StatCard
              label="New Boards Found"
              value={lastResult.stats.newBoardsFound}
              sub="Valid boards with active jobs, added to database"
            />
            <StatCard
              label="New Jobs Available"
              value={lastResult.stats.totalNewJobs.toLocaleString()}
              sub="Total job listings across discovered boards"
            />
            <StatCard
              label="Already Known"
              value={lastResult.stats.alreadyKnown.toLocaleString()}
              sub="Tokens already in the database (skipped)"
            />
          </div>

          {/* Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Result Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-zinc-500">Not Found</p>
                <p className="text-white font-medium">{lastResult.stats.notFound.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-zinc-500">No Active Jobs</p>
                <p className="text-white font-medium">{lastResult.stats.noActiveJobs}</p>
              </div>
              <div>
                <p className="text-zinc-500">Errors</p>
                <p className={lastResult.stats.errors > 0 ? "text-red-400 font-medium" : "text-white font-medium"}>
                  {lastResult.stats.errors}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Source</p>
                <p className="text-white font-medium">
                  {SOURCE_OPTIONS.find((o) => o.value === lastResult.source)?.label ?? lastResult.source}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Duration</p>
                <p className="text-white font-medium">{formatDuration(lastResult.durationMs)}</p>
              </div>
            </div>
          </div>

          {/* Discovered Boards Table */}
          {lastResult.boards.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-400">
                  Discovered Boards ({lastResult.boards.length})
                </h3>
                <p className="text-xs text-zinc-500">
                  These boards have been added and will sync on the next scheduled run
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Board Token
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Company Name
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        Active Jobs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.boards.map((board) => (
                      <tr
                        key={board.token}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-violet-300">
                            {board.token}
                          </code>
                        </td>
                        <td className="px-5 py-3 text-sm text-zinc-300">{board.name}</td>
                        <td className="px-5 py-3 text-sm text-zinc-400 text-right">
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5" />
                            {board.jobCount.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {lastResult.boards.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <p className="text-zinc-300 text-sm">
                No new boards found. All discoverable boards are already in the database.
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                Try again in a few weeks as new companies adopt Greenhouse and Ashby.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state — no last result and not running */}
      {!lastResult && !isRunning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Search className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">
            No discovery runs yet. Select a source above and click &ldquo;Run Discovery&rdquo; to find new boards.
          </p>
        </div>
      )}
    </div>
  )
}
