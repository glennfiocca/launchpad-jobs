/**
 * Strip career-portal subdomains from a discovered company website.
 *
 * Many ATS-discovered websites point at a careers subdomain
 * (`careers.datadoghq.com`, `jobs.elastic.co`) rather than the brand's
 * apex domain. logo.dev resolves apex domains far more reliably than
 * subdomains — `careers.datadoghq.com` returns a 404 while `datadoghq.com`
 * returns the canonical Datadog logo.
 *
 * Scope: ONLY the prefixes listed below get stripped. Multi-level TLD
 * parsing (`co.uk`, `eu.greenhouse.io`) is intentionally not attempted —
 * it's a tar pit and these prefixes cover the realistic career-portal cases.
 *
 * Output discards path/search/hash: the website signal feeds logo.dev,
 * which only consumes the hostname. Keeping `/careers/positions` would
 * be useless noise.
 */

const SUBDOMAIN_PREFIXES = [
  "careers.",
  "jobs.",
  "apply.",
  "career.",
  "join.",
] as const;

export function toApex(url: string): string {
  try {
    const u = new URL(url);
    for (const prefix of SUBDOMAIN_PREFIXES) {
      if (u.hostname.startsWith(prefix)) {
        // Reconstruct with apex hostname, preserve protocol; drop path/
        // search/hash since the apex root is what we want for logo.dev.
        return `${u.protocol}//${u.hostname.slice(prefix.length)}`;
      }
    }
    return `${u.protocol}//${u.hostname}`;
  } catch {
    // Malformed input — return as-is so the caller decides what to do.
    return url;
  }
}
