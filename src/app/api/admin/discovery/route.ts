import { NextRequest, NextResponse } from "next/server"
import { requireAdminSession } from "../_helpers"
import type { ApiResponse } from "@/types"

/**
 * Discovery pipeline API.
 *
 * GET  — Returns the status and results of the current or most recent discovery run.
 * POST — Starts a new discovery run. Only one can run at a time.
 *
 * Discovery runs are tracked in-memory since they are infrequent and short-lived.
 * Results persist to JSON files in scripts/discovery/ for audit.
 */

interface DiscoveryStatus {
  running: boolean
  phase: string
  source: string
  progress: { completed: number; total: number; current: string }
  startedAt: string
  startedBy: string
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
  boards: Array<{ token: string; name: string; jobCount: number }>
}

// In-memory state for the current run
let currentRun: DiscoveryStatus | null = null
let lastResult: DiscoveryResult | null = null

export function getDiscoveryState() {
  return { currentRun, lastResult }
}

export function setDiscoveryProgress(
  phase: string,
  completed: number,
  total: number,
  current: string
) {
  if (currentRun) {
    currentRun.phase = phase
    currentRun.progress = { completed, total, current }
  }
}

export function clearCurrentRun() {
  currentRun = null
}

export function setLastResult(result: DiscoveryResult) {
  lastResult = result
}

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  return NextResponse.json<ApiResponse<{ status: DiscoveryStatus | null; lastResult: DiscoveryResult | null }>>({
    success: true,
    data: { status: currentRun, lastResult },
  })
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdminSession()
  if (error) return error

  if (currentRun) {
    return NextResponse.json<ApiResponse<{ status: DiscoveryStatus }>>(
      { success: false, error: "A discovery run is already in progress", data: { status: currentRun } },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => ({})) as { source?: string; dryRun?: boolean }
  const source = body.source ?? "all"
  const dryRun = body.dryRun ?? false

  if (!["all", "companies", "github", "careers"].includes(source)) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: `Invalid source: ${source}. Use: all, companies, github, careers` },
      { status: 400 },
    )
  }

  const startedBy = session.user.email ?? "unknown"

  currentRun = {
    running: true,
    phase: "initializing",
    source,
    progress: { completed: 0, total: 0, current: "Starting..." },
    startedAt: new Date().toISOString(),
    startedBy,
  }

  // Fire-and-forget: run discovery in background
  runDiscoveryBackground(source, dryRun, startedBy).catch((err) => {
    console.error("[discovery] Background worker fatal:", err)
    currentRun = null
  })

  return NextResponse.json<ApiResponse<{ status: DiscoveryStatus }>>(
    { success: true, data: { status: currentRun } },
    { status: 202 },
  )
}

async function runDiscoveryBackground(
  source: string,
  dryRun: boolean,
  startedBy: string
): Promise<void> {
  const startTime = Date.now()

  try {
    // Dynamic imports to avoid loading heavy modules at route init
    const { RateLimiter } = await import("../../../../../scripts/discovery/rate-limiter")
    const { TokenValidator } = await import("../../../../../scripts/discovery/validate-token")
    const { getExistingTokens, ingestBoards, disconnect } = await import(
      "../../../../../scripts/discovery/ingest"
    )
    const { discoverFromCompanyLists } = await import(
      "../../../../../scripts/discovery/source-company-lists"
    )
    const { discoverFromGitHub } = await import("../../../../../scripts/discovery/source-github")
    const { discoverFromCareerPages } = await import(
      "../../../../../scripts/discovery/source-career-pages"
    )

    // Load existing tokens
    if (currentRun) currentRun.phase = "loading_existing_tokens"
    const existingTokens = await getExistingTokens()

    // Also add SEED_BOARDS
    try {
      const { SEED_BOARDS } = await import("@/lib/greenhouse/sync")
      for (const board of SEED_BOARDS) {
        existingTokens.add(board.token.toLowerCase())
      }
    } catch {
      // Non-fatal
    }

    const rateLimiter = new RateLimiter()
    const validator = new TokenValidator(existingTokens, rateLimiter)

    type ValidationResult = Awaited<ReturnType<typeof validator.validate>>
    const allResults: ValidationResult[] = []

    const makeProgress = (phase: string) => (completed: number, total: number, current: string) => {
      setDiscoveryProgress(phase, completed, total, current)
    }

    // Source A
    if (source === "all" || source === "companies") {
      if (currentRun) currentRun.phase = "company_lists"
      const result = await discoverFromCompanyLists(validator, makeProgress("company_lists"))
      allResults.push(...result.results)
    }

    // Source B
    if (source === "all" || source === "github") {
      if (currentRun) currentRun.phase = "github_mining"
      const result = await discoverFromGitHub(validator, makeProgress("github_mining"))
      allResults.push(...result.results)
    }

    // Source C
    if (source === "all" || source === "careers") {
      if (currentRun) currentRun.phase = "career_pages"
      const result = await discoverFromCareerPages(validator, undefined, makeProgress("career_pages"))
      allResults.push(...result.results)
    }

    // Collect valid boards (same logic as CLI)
    const MIN_JOB_COUNT = 3
    const BLOCKLIST = new Set(["global", "us", "remote", "general", "international", "journey", "universal", "the", "jobs", "career", "careers"])

    const validBoards = allResults
      .filter((r) => r.valid && r.board !== null)
      .filter((r) => r.board!.jobCount >= MIN_JOB_COUNT)
      .filter((r) => !BLOCKLIST.has(r.board!.token))
      .map((r) => r.board!)

    // Ingest unless dry run
    if (!dryRun && validBoards.length > 0) {
      if (currentRun) currentRun.phase = "ingesting"
      await ingestBoards(validBoards)
    }

    await disconnect()

    const alreadyKnown = allResults.filter((r) => r.error === "already_known").length
    const notFound = allResults.filter((r) => r.error === "not_found").length
    const noActiveJobs = allResults.filter((r) => r.error === "no_active_jobs").length
    const errors = allResults.filter(
      (r) => r.error && !["already_known", "not_found", "no_active_jobs"].includes(r.error)
    ).length
    const totalNewJobs = validBoards.reduce((sum, b) => sum + b.jobCount, 0)

    lastResult = {
      completedAt: new Date().toISOString(),
      source,
      startedBy,
      durationMs: Date.now() - startTime,
      stats: {
        candidatesTested: allResults.length,
        alreadyKnown,
        notFound,
        noActiveJobs,
        errors,
        newBoardsFound: validBoards.length,
        totalNewJobs,
      },
      boards: validBoards
        .sort((a, b) => b.jobCount - a.jobCount)
        .map((b) => ({ token: b.token, name: b.name, jobCount: b.jobCount })),
    }
  } finally {
    currentRun = null
  }
}
