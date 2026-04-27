/**
 * Logo URL helpers for logo.dev integration.
 *
 * Kept in a standalone file (no path-alias imports) so these pure functions
 * can be unit-tested directly by Vitest without pulling in the React component
 * tree or Next.js path aliases.
 *
 * ADR: logo.dev dark-theme strategy
 *
 * Problem: dark-on-transparent marks (Okta, Anduril) are nearly invisible on
 * the app's #0a0a0a backgrounds because the mark is near-black on a near-black
 * tile (bg-white/8 ≈ #212121).
 *
 * Decision: add theme=dark to all logo.dev URLs.
 *   - Transparent-background logos: logo.dev converts the mark to white/light
 *     → clearly legible on any dark background.
 *   - Colored-plate logos (HelloFresh green, DoorDash red): the plate color
 *     lives in the image pixels, not in transparency, so theme=dark does not
 *     alter it — brand pop is preserved.
 *   - retina=true: 2× image for HiDPI displays, no visual downside.
 *
 * URL stability: adding these params does not invalidate previously cached
 * URLs stored in the DB; normalizeLogoUrl() upgrades them client-side at
 * render time, so no DB re-enrichment pass is required.
 */

/**
 * Builds a logo.dev URL optimised for dark backgrounds.
 */
export function getLogoUrl(website: string): string | null {
  try {
    const hostname = new URL(website).hostname;
    const token = process.env.NEXT_PUBLIC_LOGO_DEV_KEY ?? "";
    const params = new URLSearchParams({
      token,
      size: "200",
      format: "png",
      theme: "dark",
      retina: "true",
    });
    return `https://img.logo.dev/${hostname}?${params.toString()}`;
  } catch {
    return null;
  }
}

/**
 * Upgrades a stored logo.dev URL with theme=dark and retina=true at render
 * time. Non-logo.dev URLs (Greenhouse CDN, S3, data URIs, etc.) pass through
 * unchanged. Idempotent.
 */
export function normalizeLogoUrl(url: string): string {
  if (!url.startsWith("https://img.logo.dev/")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("theme", "dark");
    parsed.searchParams.set("retina", "true");
    return parsed.toString();
  } catch {
    return url;
  }
}
