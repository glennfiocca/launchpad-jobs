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
}

export async function discoverAshbyCustomJobMap(
  boardName: string,
  options?: { concurrency?: number; onProgress?: (i: number, total: number) => void },
): Promise<CustomJobMap | null> {
  const org = await fetchAshbyOrgInfo(boardName);
  if (!org) return null;
  if (!org.customJobsPageUrl) return null; // hosted board fine — no work needed

  const indexEntries = await fetchCareersIndex(org.customJobsPageUrl);
  if (indexEntries.length === 0) {
    return { byUuid: new Map(), org };
  }

  const concurrency = options?.concurrency ?? 4;
  const byUuid = new Map<string, string>();

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

  return { byUuid, org };
}
