import type { AtsProvider } from "@prisma/client"

/**
 * Mirror of the slug helper in `src/lib/ats/sync.ts`. Re-implemented here
 * instead of imported so the admin review surface doesn't pull in the
 * heavy sync runtime (Greenhouse client, mappers, classifier, etc.).
 *
 * Greenhouse boards use the raw board token as the company slug; Ashby
 * boards are namespaced (`ashby-<token>`) to avoid collisions.
 */
export function companySlug(provider: AtsProvider, boardToken: string): string {
  if (provider === "GREENHOUSE") return boardToken
  return `${provider.toLowerCase()}-${boardToken}`
}
