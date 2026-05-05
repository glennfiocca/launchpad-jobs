/**
 * Scrape a self-hosted careers page (e.g. cursor.com/careers) to build a
 * map from Ashby job UUIDs to the company's per-job custom URL.
 *
 * The trick is that company-hosted pages embed the Ashby UUID in the HTML
 * as a reference to `jobs.ashbyhq.com/{board}/{uuid}` — verified manually
 * against Cursor. By fetching each per-slug page once and regexing the UUID
 * out, we get a deterministic mapping with no fuzzy-title-match risk.
 *
 * Exposed surface:
 *   - extractSlugsFromIndex(html, indexUrl) → string[]
 *   - extractUuidFromJobPage(html) → string | null
 */

const SLUG_LINK_RE = /href="(\/careers\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?)"/g;

// Ashby UUIDs are 8-4-4-4-12 hex (RFC 4122 v4-shaped).
// CRITICAL: a careers page contains many UUIDs (form field IDs, survey
// question IDs, etc.). To pick the JOB id specifically, we anchor on
// contexts that are guaranteed to wrap the job UUID:
//   - `jobs.ashbyhq.com/{board}/{uuid}` (apply-button hrefs, analytics)
//   - `"job":{"id":"{uuid}"`           (server-rendered RSC payload)
//   - `"jobPostingId":"{uuid}"`        (alternate RSC field)
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const JOB_UUID_PATTERNS: ReadonlyArray<RegExp> = [
  new RegExp(`jobs\\.ashbyhq\\.com\\/[a-z0-9-]+\\/(${UUID_PATTERN})`, "i"),
  new RegExp(`"job":\\{"id":"(${UUID_PATTERN})"`, "i"),
  new RegExp(`"jobPostingId":"(${UUID_PATTERN})"`, "i"),
];

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface SlugMatch {
  slug: string;
  url: string;
}

/**
 * Fetch a careers index page and return the unique set of /careers/{slug}
 * links found in it. The careers index URL is whatever `customJobsPageUrl`
 * returned from Ashby's GraphQL — works as long as the path patterns are
 * `/careers/{slug}`. (Edge case: some companies use `/jobs/` or different
 * patterns; we'd need a per-domain pattern config for those.)
 */
export async function fetchCareersIndex(indexUrl: string): Promise<SlugMatch[]> {
  const html = await fetchHtml(indexUrl);
  if (!html) return [];

  const origin = new URL(indexUrl).origin;
  const seen = new Set<string>();
  const matches: SlugMatch[] = [];

  for (const m of html.matchAll(SLUG_LINK_RE)) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    matches.push({ slug: path, url: `${origin}${path}` });
  }
  return matches;
}

/**
 * Fetch a per-job page and extract the Ashby JOB UUID specifically.
 *
 * A careers page typically references many UUIDs (form fields, survey
 * questions, theme assets). We avoid the wrong-UUID trap by only matching
 * UUIDs that appear in contexts guaranteed to wrap the job ID — see
 * JOB_UUID_PATTERNS above.
 */
export async function extractAshbyUuidFromJobPage(
  jobUrl: string,
): Promise<string | null> {
  const html = await fetchHtml(jobUrl);
  if (!html) return null;

  for (const re of JOB_UUID_PATTERNS) {
    const m = html.match(re);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
