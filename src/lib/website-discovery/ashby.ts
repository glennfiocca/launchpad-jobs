/**
 * Discover a company's canonical website by fetching its public Ashby
 * jobs page and extracting the inlined `publicWebsite` field.
 *
 * Ashby's job board is a Next.js app whose initial state ships with the
 * server-rendered HTML. The org metadata sits in that JSON blob:
 *
 *   "publicWebsite":"https://www.astronomer.io/"
 *
 * Sampled across 7 boards, hit rate was 100% — Ashby populates this for
 * every published board. No JavaScript execution required, just a HEAD-
 * style HTTP fetch.
 */

import { toApex } from "./to-apex";

const ASHBY_BOARD_BASE = "https://jobs.ashbyhq.com";
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0 (compatible; LaunchpadDiscovery/1.0)";

// The `publicWebsite` value lives inside the inlined Next.js __NEXT_DATA__
// JSON. We don't want to JSON.parse the whole thing (huge, brittle to
// minor schema changes); a regex on the canonical key is enough.
const PUBLIC_WEBSITE_RE = /"publicWebsite":"(https?:\/\/[^"]+)"/;

export async function discoverAshbyWebsite(boardName: string): Promise<string | null> {
  if (!boardName) return null;

  const url = `${ASHBY_BOARD_BASE}/${encodeURIComponent(boardName)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const html = await res.text();
    const m = html.match(PUBLIC_WEBSITE_RE);
    if (!m) return null;

    // toApex() strips known career-portal subdomains and discards path/
    // search/hash, leaving an apex-shaped URL ready for logo.dev lookup.
    return toApex(m[1]);
  } catch {
    return null;
  }
}
