/**
 * Discover a company's canonical website by fetching its public Greenhouse
 * job board and parsing the HTML for company-website signals.
 *
 * Greenhouse's templates vary widely by customer — some boards use heavily
 * customized themes that include a clearly-marked header logo link; others
 * use Greenhouse's bare template that renders almost nothing without JS.
 *
 * Resolution order (most reliable first):
 *   1. <a class="logo" href="..."> — the header logo link in custom themes
 *   2. <link rel="canonical" href="..."> when it points outside greenhouse.io
 *   3. og:url meta when it points outside greenhouse.io
 *   4. null (caller decides — manual override or Playwright fallback)
 *
 * The HTTP-only path here covers maybe 40-60% of Greenhouse boards; the
 * remainder need browser-rendered DOM inspection (planned as a follow-on).
 */

const GREENHOUSE_BOARD_BASE = "https://job-boards.greenhouse.io";
const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = "Mozilla/5.0 (compatible; LaunchpadDiscovery/1.0)";

// Patterns are tried in order. First non-greenhouse URL wins.
const HEADER_LOGO_RE = /<a[^>]*class="logo"[^>]*href="(https?:\/\/[^"]+)"/i;
const HEADER_LOGO_RE_ALT = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="logo"/i;
const CANONICAL_RE = /<link[^>]*rel="canonical"[^>]*href="(https?:\/\/[^"]+)"/i;
const OG_URL_RE = /<meta[^>]*property="og:url"[^>]*content="(https?:\/\/[^"]+)"/i;

export async function discoverGreenhouseWebsite(boardToken: string): Promise<string | null> {
  if (!boardToken) return null;

  const url = `${GREENHOUSE_BOARD_BASE}/${encodeURIComponent(boardToken)}`;

  let html: string;
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
    html = await res.text();
  } catch {
    return null;
  }

  // Try each pattern. Reject any match that points back to greenhouse.io
  // itself — those are useless ("canonical: this very page" cases).
  for (const re of [HEADER_LOGO_RE, HEADER_LOGO_RE_ALT, CANONICAL_RE, OG_URL_RE]) {
    const m = html.match(re);
    if (!m) continue;
    const candidate = normalize(m[1]);
    if (!candidate) continue;
    if (isGreenhouseSelfReference(candidate)) continue;
    return candidate;
  }

  return null;
}

function isGreenhouseSelfReference(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith("greenhouse.io") || host.endsWith("recaptcha.net");
  } catch {
    return false;
  }
}

/**
 * Strip query/hash and normalize trailing slash. Drop any path component
 * past root so we get the canonical website rather than e.g.
 * "https://stripe.com/jobs/search" — that's a sub-path, not the company's
 * homepage. The hostname is what matters for logo.dev anyway.
 */
function normalize(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url;
  }
}
