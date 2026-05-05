/**
 * Walk an HTTP redirect chain manually and return the final URL.
 *
 * Used by Greenhouse discovery: the public board URL often 301s to the
 * company's real careers page. The default `fetch` redirect: "follow"
 * mode swallows that hop, so we never see the brand-side URL. Walking
 * the chain manually surfaces it.
 *
 * Stops on:
 *   - 2xx/4xx/5xx status (definitive answer)
 *   - missing `Location` header on a 3xx (broken redirect)
 *   - reaching `maxHops` (defends against redirect loops)
 *
 * Returns the URL we landed on, NOT the final response — the caller
 * decides whether the URL itself counts as a brand signal (via
 * `toApex()` + ATS-domain filtering).
 */

const DEFAULT_MAX_HOPS = 5;
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = "Mozilla/5.0 (compatible; LaunchpadDiscovery/1.0)";

export async function followRedirectChain(
  url: string,
  maxHops: number = DEFAULT_MAX_HOPS,
): Promise<string> {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      // Network error or timeout — return whatever we have so far.
      return current;
    }

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return current;
      // Resolve relative redirects against the current URL (e.g. "/embed/...").
      current = new URL(next, current).toString();
      continue;
    }
    // 2xx, 4xx, 5xx — chain ends here.
    return current;
  }
  return current;
}
