import type { AtsProvider } from "@prisma/client"

/**
 * Public API URL for a board — what we hit during sync. Exposed to admins
 * so they can sanity-check the raw response when a card looks off.
 */
export function rawBoardApiUrl(provider: AtsProvider, boardToken: string): string {
  if (provider === "ASHBY") {
    return `https://api.ashbyhq.com/posting-api/job-board/${boardToken}`
  }
  return `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs`
}

/**
 * Canonical human-facing board page. The reviewer opens this in a new tab
 * to confirm the slug actually maps to the intended company.
 */
export function canonicalBoardUrl(provider: AtsProvider, boardToken: string): string {
  if (provider === "ASHBY") {
    return `https://jobs.ashbyhq.com/${boardToken}`
  }
  return `https://boards.greenhouse.io/${boardToken}`
}
