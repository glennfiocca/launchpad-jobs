/**
 * Logo URL helpers for logo.dev integration.
 *
 * Kept in a standalone file (no path-alias imports) so these pure functions
 * can be unit-tested directly by Vitest without pulling in the React component
 * tree or Next.js path aliases.
 *
 * ADR: logo.dev theme strategy
 *
 * Problem: our app's surface is dark (#0a0a0a). logo.dev returns a single
 * variant per request, governed by the `theme` query param (auto/dark/light).
 * The "right" variant for a given brand is unfortunately not always the one
 * the param name implies.
 *
 * Empirical findings against our catalogue:
 *   - `theme=dark` was our previous default. For some brands (Astronomer,
 *     Okta, others) logo.dev returns a dark-grey-PLATE version with the
 *     coloured mark. Looks ugly on our dark page — the plate blends in.
 *   - `theme=light` returns the white-plate / light-mark variant for most
 *     brands. White plates pop against #0a0a0a; transparent + light mark
 *     reads cleanly. This is the better baseline.
 *   - `theme=auto` is logo.dev's default; behaviour is brand-dependent and
 *     less predictable than picking explicitly.
 *
 * Decision: default to `theme=light` everywhere. For brands where the light
 * variant is wrong (e.g. a brand whose canonical mark is a light color that
 * gets obscured), set `theme: "dark"` per-brand via the LogoOverride map in
 * src/lib/company-logo/overrides.ts.
 *
 * Note that `theme=*` only affects images logo.dev publishes with
 * transparency. Coloured-plate logos (HelloFresh green, DoorDash red) are
 * unaffected — their plate colour is in the pixels — and they show their
 * brand colours intact.
 *
 * URL stability: cached logo.dev URLs in the DB get upgraded at render time
 * by `normalizeLogoUrl` so previously-cached `theme=dark` URLs become
 * `theme=light` automatically. Spaces-cached PNGs DON'T self-update (the
 * cached image is whatever logo.dev returned at fetch time) — those need a
 * `--force-logo` backfill pass to refresh.
 */

export type LogoTheme = "light" | "dark" | "auto";

const DEFAULT_THEME: LogoTheme = "light";

/**
 * Builds a logo.dev URL for a given website + theme.
 *
 * @param website  Company website (only the hostname is used)
 * @param theme    Override the default theme. Omit for "light" (default).
 */
export function getLogoUrl(
  website: string,
  theme: LogoTheme = DEFAULT_THEME,
): string | null {
  try {
    const hostname = new URL(website).hostname;
    const token = process.env.NEXT_PUBLIC_LOGO_DEV_KEY ?? "";
    const params = new URLSearchParams({
      token,
      size: "200",
      format: "png",
      theme,
      retina: "true",
    });
    return `https://img.logo.dev/${hostname}?${params.toString()}`;
  } catch {
    return null;
  }
}

/**
 * Render-time upgrade for stored logo.dev URLs:
 *   - Always sets `theme` to the default (currently "light") so legacy
 *     URLs stored under the old `theme=dark` regime auto-correct without a
 *     DB rewrite. If you need a non-default theme for a specific brand,
 *     use the override map → enrichment path so the cached PNG matches.
 *   - Always sets `retina=true`.
 *
 * Non-logo.dev URLs (Greenhouse CDN, S3, data: URIs, our Spaces CDN) pass
 * through unchanged. Idempotent.
 */
export function normalizeLogoUrl(url: string): string {
  if (!url.startsWith("https://img.logo.dev/")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("theme", DEFAULT_THEME);
    parsed.searchParams.set("retina", "true");
    return parsed.toString();
  } catch {
    return url;
  }
}
