import type { AtsProvider } from "@prisma/client"
import type { MissValidateResult } from "./types"

const PROBE_TIMEOUT_MS = 10_000

// Defensive shape interfaces — we don't trust the upstream payload schema
// beyond the few fields we read. Everything is optional and locally typed
// so a missing field collapses to `undefined` rather than throwing.
interface GhJob {
  readonly id?: number | string
  readonly title?: string
  readonly absolute_url?: string
}

interface GhBoardJobsResponse {
  readonly jobs?: ReadonlyArray<GhJob>
  readonly meta?: { readonly total?: number }
}

interface GhBoardResponse {
  readonly name?: string
}

interface AshbyJob {
  readonly title?: string
  readonly jobUrl?: string
  readonly isListed?: boolean
}

interface AshbyBoardResponse {
  readonly jobs?: ReadonlyArray<AshbyJob>
  readonly apiVersion?: string
}

/**
 * Live-probe a board against the public ATS API. Used by the admin
 * "Validate" button before saving a manual slug for a `BoardReviewMiss`.
 *
 * Returns a discriminated result rather than throwing — every failure mode
 * (404, timeout, non-OK status, malformed JSON) becomes `{ ok: false, error }`
 * so the caller can render it uniformly.
 */
export async function probeBoard(
  slug: string,
  provider: AtsProvider
): Promise<MissValidateResult> {
  const normalized = slug.toLowerCase().trim()
  if (!normalized) return { ok: false, error: "Slug is empty" }

  try {
    if (provider === "GREENHOUSE") {
      return await probeGreenhouse(normalized)
    }
    return await probeAshby(normalized)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Probe failed: ${message}` }
  }
}

async function probeGreenhouse(slug: string): Promise<MissValidateResult> {
  const base = "https://boards-api.greenhouse.io/v1/boards"

  const boardRes = await fetchWithTimeout(`${base}/${slug}`)
  if (boardRes.status === 404) return { ok: false, error: "Board not found" }
  if (!boardRes.ok) return { ok: false, error: `HTTP ${boardRes.status}` }
  const boardData = (await boardRes.json()) as GhBoardResponse

  const jobsRes = await fetchWithTimeout(`${base}/${slug}/jobs`)
  if (!jobsRes.ok) return { ok: false, error: `Jobs HTTP ${jobsRes.status}` }
  const jobsData = (await jobsRes.json()) as GhBoardJobsResponse
  const jobs = jobsData.jobs ?? []
  const sample = jobs[0]

  return {
    ok: true,
    activeJobs: jobs.length,
    boardName: boardData.name,
    sampleJobTitle: sample?.title,
    sampleJobUrl: sample?.absolute_url,
  }
}

async function probeAshby(slug: string): Promise<MissValidateResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  const res = await fetchWithTimeout(url)
  if (res.status === 404) return { ok: false, error: "Board not found" }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = (await res.json()) as AshbyBoardResponse
  const listed = (data.jobs ?? []).filter((j) => j.isListed)
  const sample = listed[0]

  return {
    ok: true,
    activeJobs: listed.length,
    boardName: slug,
    sampleJobTitle: sample?.title,
    sampleJobUrl: sample?.jobUrl,
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    })
  } finally {
    clearTimeout(timeout)
  }
}
