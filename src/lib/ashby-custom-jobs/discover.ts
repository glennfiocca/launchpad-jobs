/**
 * High-level orchestrator: given an Ashby board name, return a map from
 * Ashby UUID → canonical custom-jobs URL.
 *
 * Returns null if the company doesn't self-host (i.e. Ashby's hosted
 * board works fine and `Job.absoluteUrl` should remain unchanged).
 */

import { fetchAshbyOrgInfo, type AshbyOrgInfo } from "./graphql";
import { fetchCareersIndex, extractAshbyUuidFromJobPage } from "./scrape";

export interface CustomJobMap {
  /** uuid → canonical custom URL on the company's careers site. */
  byUuid: Map<string, string>;
  /** Echo of the org metadata that produced this map. */
  org: AshbyOrgInfo;
  /**
   * Build a "good-enough" fallback URL for any UUID we couldn't match via
   * scraping. Most Ashby self-hosters embed the apply widget at their
   * careers root and read `?ashby_jid={uuid}` to deeplink — empirically
   * this works for FullStory-class boards (renders the specific job) and
   * lands on the careers index for the few that ignore the param. Either
   * way, it's strictly better than the dead jobs.ashbyhq.com URL.
   */
  buildFallbackUrl(uuid: string): string | null;
}

export async function discoverAshbyCustomJobMap(
  boardName: string,
  options?: { concurrency?: number; onProgress?: (i: number, total: number) => void },
): Promise<CustomJobMap | null> {
  const org = await fetchAshbyOrgInfo(boardName);
  if (!org) return null;
  if (!org.customJobsPageUrl) return null; // hosted board fine — no work needed

  const buildFallbackUrl = makeFallbackBuilder(org.customJobsPageUrl);
  const byUuid = new Map<string, string>();

  const indexEntries = await fetchCareersIndex(org.customJobsPageUrl);
  if (indexEntries.length === 0) {
    return { byUuid, org, buildFallbackUrl };
  }

  const concurrency = options?.concurrency ?? 4;

  for (let i = 0; i < indexEntries.length; i += concurrency) {
    const batch = indexEntries.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (entry) => {
        const uuid = await extractAshbyUuidFromJobPage(entry.url);
        return uuid ? { uuid, url: entry.url } : null;
      }),
    );
    for (const r of results) {
      if (!r) continue;
      // First-write wins. If two slugs reference the same UUID (extremely
      // rare; would mean duplicate page), the first one is canonical.
      if (!byUuid.has(r.uuid)) byUuid.set(r.uuid, r.url);
    }
    options?.onProgress?.(Math.min(i + concurrency, indexEntries.length), indexEntries.length);
  }

  return { byUuid, org, buildFallbackUrl };
}

/**
 * Build a `?ashby_jid={uuid}` URL on the org's customJobsPageUrl base.
 * Strips any preset ashby_jid + tracking params from the base so we don't
 * leak the org's example UUID or stale UTM tags.
 *
 * Returns null when the customJobsPageUrl points back to ashbyhq.com (e.g.
 * Rev's stale config) — those URLs don't render specific job content
 * client-side, so falling back to the original Ashby URL is no improvement.
 */
export function buildAshbyJidFallback(
  customJobsPageUrl: string,
  uuid: string,
): string | null {
  try {
    const u = new URL(customJobsPageUrl);
    if (u.hostname.endsWith("ashbyhq.com")) return null;
    for (const k of ["ashby_jid", "utm_source", "utm_medium", "utm_campaign"]) {
      u.searchParams.delete(k);
    }
    u.searchParams.set("ashby_jid", uuid);
    return u.toString();
  } catch {
    return null;
  }
}

function makeFallbackBuilder(customJobsPageUrl: string): (uuid: string) => string | null {
  return (uuid: string) => buildAshbyJidFallback(customJobsPageUrl, uuid);
}
