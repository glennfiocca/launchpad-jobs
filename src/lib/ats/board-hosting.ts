import type { AtsProvider, BoardHosting } from "@prisma/client";
import type { NormalizedJob } from "./types";

interface HostingClassification {
  hosting: BoardHosting;
  applyHostname: string | null;
}

/**
 * Classify a board's hosting model from the URLs in its jobs feed.
 *
 * The browser-extension autofill path needs to know whether a board is
 * served from the ATS's canonical domain (Greenhouse / Ashby host the
 * apply form themselves — generic per-ATS selectors work) or embedded
 * behind a company-owned domain (selectors are per-company).
 *
 * Approach: take the hostname of each non-null absoluteUrl, count
 * occurrences, and classify based on the most common host. Majority rule
 * tolerates mixed-feed edge cases (a handful of legacy URLs left over on
 * the old domain) without flipping the classification on every sync.
 *
 * Returns hosting=UNKNOWN + applyHostname=null only when no URLs in the
 * feed are parseable — i.e. the board returned zero jobs or every URL
 * failed to parse. In every other case both fields are populated.
 */
export function classifyBoardHosting(
  jobs: readonly NormalizedJob[],
  provider: AtsProvider,
): HostingClassification {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const host = hostnameOf(job.absoluteUrl);
    if (!host) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { hosting: "UNKNOWN", applyHostname: null };
  }

  // Pick the most common hostname. Ties are broken arbitrarily — fine
  // because either tied host implies the same hosting classification in
  // practice (you don't have a board split 50/50 between greenhouse.io
  // and a custom domain).
  let topHost = "";
  let topCount = -1;
  for (const [host, count] of counts) {
    if (count > topCount) {
      topHost = host;
      topCount = count;
    }
  }

  return {
    hosting: classifyHost(topHost, provider),
    applyHostname: topHost,
  };
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function classifyHost(host: string, provider: AtsProvider): BoardHosting {
  if (host.endsWith("greenhouse.io") || host.endsWith("greenhouse.com")) {
    return "GREENHOUSE_HOSTED";
  }
  if (host.endsWith("ashbyhq.com")) {
    return "ASHBY_HOSTED";
  }
  // Custom domain. The `provider` arg is retained for future use (e.g.
  // surfacing the provider on the row) but doesn't change the result —
  // if it's not on the ATS-hosted domain, it's self-hosted regardless of
  // which ATS sits underneath.
  void provider;
  return "SELF_HOSTED";
}
