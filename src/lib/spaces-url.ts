/**
 * Pure helpers for parsing Spaces-hosted URLs.
 *
 * Kept standalone (no `@/` aliases, no SDK imports) so these can be unit-tested
 * without spinning up the S3 client or pulling Next.js path resolution.
 */

const DEFAULT_BUCKET = process.env.DO_SPACES_BUCKET ?? "pipeline-uploads";
const DEFAULT_REGION = process.env.DO_SPACES_REGION ?? "nyc3";

/**
 * Extracts the Spaces object key from a Company.logoUrl value.
 *
 * Returns the key (e.g. `logos/example.com.png`) for URLs hosted on the
 * configured Spaces bucket. Returns null for non-Spaces URLs (logo.dev,
 * data: URIs, malformed, etc.) — those are NOT in our bucket and must NOT
 * count as "referenced" when computing orphan diffs.
 *
 * Accepts both the bare bucket-host form
 *   https://{bucket}.{region}.digitaloceanspaces.com/{key}
 * and the CDN form
 *   https://{bucket}.{region}.cdn.digitaloceanspaces.com/{key}
 *
 * Pass `bucket` and `region` to override the env-derived defaults (useful in
 * tests + when the script is parameterised).
 */
export function extractSpacesKey(
  url: string | null | undefined,
  bucket: string = DEFAULT_BUCKET,
  region: string = DEFAULT_REGION
): string | null {
  if (typeof url !== "string" || url.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.toLowerCase();
  const expectedDirect = `${bucket}.${region}.digitaloceanspaces.com`.toLowerCase();
  const expectedCdn = `${bucket}.${region}.cdn.digitaloceanspaces.com`.toLowerCase();

  if (host !== expectedDirect && host !== expectedCdn) return null;

  // pathname includes the leading slash; strip it.
  const key = parsed.pathname.replace(/^\/+/, "");
  return key.length > 0 ? key : null;
}
