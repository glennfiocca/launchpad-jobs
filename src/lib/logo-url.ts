/**
 * Logo URL helpers for logo.dev integration.
 *
 * Kept in a standalone file (no path-alias imports) so these pure functions
 * can be unit-tested directly by Vitest without pulling in the React component
 * tree or Next.js path aliases.
 *
 * URL strategy: bare logo.dev (token + retina). This is the JPEG default —
 * logo.dev returns a white-plate variant for almost every brand which pops
 * cleanly on our dark surface.
 *
 * Past experiments with `theme=dark/light` and `format=png` produced
 * brand-dependent inconsistency: dark plates that blended with our bg,
 * transparent marks that vanished, etc. The bare URL is the same output
 * logo.dev shows on its own preview pages — what brand teams sign off on —
 * and it's been the most reliable choice across the catalogue.
 *
 * For brands where the default still doesn't look right, set an explicit
 * `logoUrl` per-company in src/lib/company-logo/overrides.ts. The override
 * URL is fetched verbatim and cached to Spaces, bypassing this function.
 */

/**
 * Builds a logo.dev URL for a given website.
 */
export function getLogoUrl(website: string): string | null {
  try {
    const hostname = new URL(website).hostname;
    const token = process.env.NEXT_PUBLIC_LOGO_DEV_KEY ?? "";
    const params = new URLSearchParams({ token, retina: "true" });
    return `https://img.logo.dev/${hostname}?${params.toString()}`;
  } catch {
    return null;
  }
}

/**
 * Render-time normalizer for stored logo.dev URLs:
 *   - Strips legacy params we no longer want (theme, format, size). Older
 *     rows in the DB were written with these; this function lets us migrate
 *     without touching the database.
 *   - Always sets retina=true.
 *
 * Non-logo.dev URLs (Spaces CDN, S3, data: URIs, etc.) pass through
 * unchanged. Idempotent.
 */
export function normalizeLogoUrl(url: string): string {
  if (!url.startsWith("https://img.logo.dev/")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("theme");
    parsed.searchParams.delete("format");
    parsed.searchParams.delete("size");
    parsed.searchParams.set("retina", "true");
    return parsed.toString();
  } catch {
    return url;
  }
}
