/**
 * Domain-guessing heuristic for companies whose website isn't supplied by
 * the ATS or the override map.
 *
 * Replaces the original `scripts/backfill-websites.ts` heuristic which:
 *   - Always tried `.com` first and never anything else (broken for `.io`,
 *     `.ai`, `.co`, `.so` startups)
 *   - Accepted 200, 403, 405 as "valid" (a parked-domain 403 passed the
 *     check, leaking wrong domains into the logo pipeline)
 *
 * This module probes a priority-ordered TLD list and only accepts a 200.
 */

const PROBE_TLDS: ReadonlyArray<string> = ["com", "io", "ai", "co", "so", "dev", "tech"];

// Generic / placeholder slugs we never try to resolve to a domain — they
// produce garbage hits ("global.com" exists for some entity, not relevant).
const SKIP_TOKENS = new Set([
  "global", "us", "uk", "eu", "remote", "general", "international",
  "loop", "flex", "make",
]);

const VERIFY_TIMEOUT_MS = 5000;

/**
 * Cleans a board token to remove trailing noise that breaks domain matches.
 * Examples: "doordashusa" → still "doordashusa" (we leave it; it's not a
 * pattern we can fix), "telnyx54" → "telnyx", "stubhubinc" → "stubhub".
 */
function cleanToken(token: string): string {
  return token
    .replace(/\d+$/, "")
    .replace(/careers$/i, "")
    .replace(/inc$/i, "")
    .replace(/jobs$/i, "")
    .replace(/llc$/i, "");
}

async function verifyDomain(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaunchpadBot/1.0)" },
    });
    clearTimeout(timeout);
    // Strict: only 200 is acceptable. 403/405 means "the server exists but
    // won't talk to me" — that's not "this is the right company's site",
    // and accepting it was the original bug.
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Probes a token across multiple TLDs and returns the first one that
 * verifies. Returns null when no TLD matches (caller should fall back to
 * either the override map or surface the company without a logo).
 *
 * Skip-list is checked first so we don't waste 7×5s of HEAD requests on
 * obviously-generic tokens.
 */
export async function guessWebsiteFromSlug(
  slug: string,
): Promise<string | null> {
  if (!slug) return null;
  const cleaned = cleanToken(slug);
  if (cleaned.length < 3) return null;
  if (SKIP_TOKENS.has(cleaned.toLowerCase())) return null;

  for (const tld of PROBE_TLDS) {
    const candidate = `https://www.${cleaned}.${tld}`;
    if (await verifyDomain(candidate)) return candidate;
  }

  return null;
}
