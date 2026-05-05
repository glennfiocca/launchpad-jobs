/**
 * Provider-agnostic website discovery dispatcher.
 *
 * Given a company's ATS provider + board token, attempt to fetch the
 * canonical company website by scraping the public job-board page. Used
 * by `scripts/discover-company-websites.ts` to refresh stale or missing
 * `Company.website` values across the catalogue, which feed into the
 * logo.dev pipeline.
 */

import type { AtsProvider } from "@prisma/client";
import { discoverAshbyWebsite } from "./ashby";
import { discoverGreenhouseWebsite } from "./greenhouse";

export interface DiscoveryResult {
  website: string | null;
  source: "ashby" | "greenhouse" | "none";
}

export async function discoverWebsite(
  provider: AtsProvider,
  boardToken: string,
): Promise<DiscoveryResult> {
  if (provider === "ASHBY") {
    const website = await discoverAshbyWebsite(boardToken);
    return { website, source: website ? "ashby" : "none" };
  }
  if (provider === "GREENHOUSE") {
    const website = await discoverGreenhouseWebsite(boardToken);
    return { website, source: website ? "greenhouse" : "none" };
  }
  return { website: null, source: "none" };
}
