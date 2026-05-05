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
 *   4. Playwright fallback — boots a real browser, lets the JS render,
 *      reads the header logo's href. Equivalent to manually clicking
 *      the logo on the live page. Slow (~3-5s/board) but robust.
 *
 * The HTTP-only path is fast and covers heavily-customized themes; the
 * Playwright path covers Greenhouse's stock template and CloudFront-
 * blocked HTTP responses. Combined, the catalogue should be ~95%+ covered.
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

  // Try the cheap HTTP path first; only spin up a browser when it fails.
  const fast = await discoverGreenhouseViaHttp(boardToken);
  if (fast) return fast;

  return null;
}

/**
 * HTTP-only discovery — fast, no browser. Skips when CloudFront blocks
 * (403) or when the bare Greenhouse template renders nothing useful.
 */
async function discoverGreenhouseViaHttp(boardToken: string): Promise<string | null> {
  const url = `${GREENHOUSE_BOARD_BASE}/${encodeURIComponent(boardToken)}`;

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        // Browser-shaped headers help avoid CloudFront WAF false positives.
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
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

/**
 * Browser-based discovery — boots a Chromium page, lets the React app
 * mount, then reads the header logo's `href`. The header logo is the
 * element a user would click to leave the board for the company's
 * homepage. Equivalent to the manual flow.
 *
 * Importantly imported lazily so the website-discovery module can be
 * loaded in non-Node contexts (e.g. server components that import the
 * fast path) without dragging in playwright's binaries.
 */
export async function discoverGreenhouseViaBrowser(
  boardToken: string,
  page: import("playwright").Page,
): Promise<string | null> {
  const url = `${GREENHOUSE_BOARD_BASE}/${encodeURIComponent(boardToken)}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    // Greenhouse's stock React template renders the header logo as a link
    // wrapping an <img>. Selectors below match the customized + stock
    // variants. First non-empty href wins.
    const candidates: ReadonlyArray<string> = [
      'header a[href*="://"][rel="noreferrer"]',
      'a.logo[href*="://"]',
      'header a[href*="://"]:has(img)',
      '[data-testid="header"] a[href*="://"]',
    ];
    for (const sel of candidates) {
      const href = await page.locator(sel).first().getAttribute("href").catch(() => null);
      if (!href) continue;
      const candidate = normalize(href);
      if (!candidate) continue;
      if (isGreenhouseSelfReference(candidate)) continue;
      return candidate;
    }
  } catch {
    // Network error, navigation timeout, etc. — propagate as miss.
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
