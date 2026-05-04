// IndexNow client — notifies participating search engines (Bing, Yandex,
// Naver, Seznam) when URLs are added or removed so they crawl within minutes
// instead of days. Google does NOT participate; for Google we rely on the
// sitemap + manual GSC submission (see docs/seo-indexing.md).
//
// Protocol: https://www.bing.com/indexnow/getstarted
//
// The IndexNow protocol requires a sentinel key file reachable at a
// `keyLocation` URL on this host. The file content is the key itself
// (a UUID we set via INDEXNOW_KEY env). See
// `src/app/indexnow-verification/[key]/route.ts` for the sentinel route —
// the protocol allows any URL on the same host, not just `/<key>.txt`. If
// INDEXNOW_KEY is unset, this module is a no-op so it's safe to ship before
// the env var is configured in DigitalOcean.
//
// All errors are swallowed: search-engine notification is a best-effort
// optimization; sync runs must never fail because IndexNow returned 5xx.

import { INDEXNOW_API_URL, INDEXNOW_BATCH_SIZE } from "@/config/seo";

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_APP_URL = "https://trypipeline.ai";

// Read the IndexNow key from env. Returns null when unset so callers can
// short-circuit cleanly. Trim defensively — a stray newline in DO env breaks
// the protocol (the file content must match byte-for-byte).
export function getIndexNowKey(): string | null {
  const raw = process.env.INDEXNOW_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Strip protocol + trailing slash to produce the bare host the IndexNow API
// expects in the `host` field. e.g. "https://trypipeline.ai/" -> "trypipeline.ai"
function getHost(appUrl: string): string {
  return appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Split an array into fixed-size chunks. Pure helper, kept inline to avoid
// pulling in lodash for one call site.
function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

// Fire one batch. Resolves on success or recoverable failure; never throws.
async function postBatch(payload: IndexNowPayload): Promise<void> {
  try {
    const res = await fetch(INDEXNOW_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // 200/202 = accepted. 422 = key file not yet reachable (expected before
    // first deploy lands). Any other 4xx/5xx = log and continue.
    if (res.status === 200 || res.status === 202) {
      console.log(`[indexnow] notified ${payload.urlList.length} URLs (${res.status})`);
      return;
    }

    if (res.status === 422) {
      console.warn(
        `[indexnow] 422: key file not yet reachable at ${payload.keyLocation} — expected before first deploy`,
      );
      return;
    }

    console.warn(
      `[indexnow] unexpected status ${res.status} for ${payload.urlList.length} URLs`,
    );
  } catch (err) {
    console.error("[indexnow] request failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Notify IndexNow of one or more URL changes. Fire-and-forget: the returned
 * promise resolves once all batches complete (or fail soft). Never rejects.
 *
 * - Silently no-ops when INDEXNOW_KEY is unset.
 * - Batches the urlList into IndexNow's 10000-URL-per-request limit.
 * - Each batch has its own 10s timeout via AbortSignal.
 */
export async function notifyIndexNow(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  const key = getIndexNowKey();
  if (!key) {
    console.log("[indexnow] skipped (no INDEXNOW_KEY configured)");
    return;
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/$/, "");
  const host = getHost(appUrl);
  // Sentinel file route — must match `src/app/indexnow-verification/[key]/route.ts`.
  // The IndexNow protocol allows the keyLocation to be any URL on the same host.
  const keyLocation = `${appUrl}/indexnow-verification/${key}`;

  const batches = chunk(urls, INDEXNOW_BATCH_SIZE);
  for (const batch of batches) {
    await postBatch({ host, key, keyLocation, urlList: batch });
  }
}
