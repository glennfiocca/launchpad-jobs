import { LogoSource } from "@prisma/client";
import { db } from "./db";
import { getLogoUrl } from "./logo-url";
import { uploadPublicBuffer } from "./spaces";

interface EnrichInput {
  id: string;
  website: string | null;
  name: string;
  /** Used as the Spaces key for explicit-source-URL overrides. */
  slug?: string;
}

interface EnrichOptions {
  /**
   * Override the fetch source. When provided, this URL is fetched verbatim
   * instead of building one from `company.website`. The downloaded bytes
   * are uploaded to Spaces under `logos/manual/{slug}.<ext>` so manual
   * overrides don't collide with hostname-keyed cache entries and are
   * stable across website changes.
   */
  sourceUrl?: string;
}

/**
 * Result of an enrichment attempt. Track B.5 of HARDENING_PLAN.md added the
 * `source` field so callers know which `LogoSource` enum value to persist
 * alongside `Company.logoUrl`. Source semantics:
 *   - `spaces_cache` — bytes were fetched + uploaded; logoUrl is the Spaces CDN URL
 *   - `monogram` — render-time fallback was set as the stored URL (logo.dev `?fallback=monogram`)
 *   - `none` — enrichment couldn't produce anything; logoUrl is null
 */
export interface EnrichResult {
  logoUrl: string | null;
  source: LogoSource;
}

/**
 * Fetches a logo image (from logo.dev by default, or a caller-supplied URL)
 * and uploads it to DigitalOcean Spaces. Persists the resulting CDN URL +
 * `LogoSource` to `Company.logoUrl` / `Company.logoSource`. Returns the
 * `EnrichResult` on success or `{ logoUrl: null, source: 'none' }` on
 * failure. Never throws — all errors are caught and logged internally.
 *
 * Two modes:
 *   - Default: derive a logo.dev URL from `company.website` + theme. Stored
 *     in Spaces under `logos/{hostname}.png`. Used by the sync hot path
 *     and the website-driven enrichment fallback.
 *   - Explicit: pass `options.sourceUrl` to fetch a specific URL (typically
 *     a logo.dev URL the operator hand-picked from the logo.dev site).
 *     Stored under `logos/manual/{slug}.png`. Used by the override map.
 */
export async function enrichCompanyLogo(
  company: EnrichInput,
  options?: EnrichOptions,
): Promise<EnrichResult> {
  const fetchUrl =
    options?.sourceUrl ??
    (company.website ? getLogoUrl(company.website) : null);
  if (!fetchUrl) {
    await markLogoSource(company.id, LogoSource.none);
    return { logoUrl: null, source: LogoSource.none };
  }

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.error(
        `enrichCompanyLogo: ${res.status} fetching ${fetchUrl} for ${company.name}`,
      );
      await markLogoSource(company.id, LogoSource.none);
      return { logoUrl: null, source: LogoSource.none };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      console.error(
        `enrichCompanyLogo: unexpected content-type "${contentType}" for ${company.name}`,
      );
      await markLogoSource(company.id, LogoSource.none);
      return { logoUrl: null, source: LogoSource.none };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Pick the correct extension from the response content-type so Spaces
    // keys are honest (a JPEG named .png browses fine but is misleading
    // in S3 listings + breaks any tooling that infers format from name).
    const ext = extFromContentType(contentType);

    // Spaces key strategy:
    //   - sourceUrl override → key by slug under logos/manual/.
    //     Stable across website changes, no collision with hostname cache.
    //   - default path → key by hostname (legacy behaviour preserved).
    let key: string;
    if (options?.sourceUrl && company.slug) {
      key = `logos/manual/${company.slug}.${ext}`;
    } else if (company.website) {
      const hostname = new URL(company.website).hostname;
      key = `logos/${hostname}.${ext}`;
    } else {
      console.error(
        `enrichCompanyLogo: cannot determine Spaces key for ${company.name} — sourceUrl without slug or website`,
      );
      await markLogoSource(company.id, LogoSource.none);
      return { logoUrl: null, source: LogoSource.none };
    }

    const cdnUrl = await uploadPublicBuffer(key, buffer, contentType);
    if (!cdnUrl) {
      await markLogoSource(company.id, LogoSource.none);
      return { logoUrl: null, source: LogoSource.none };
    }

    await db.company.update({
      where: { id: company.id },
      data: { logoUrl: cdnUrl, logoSource: LogoSource.spaces_cache },
    });

    return { logoUrl: cdnUrl, source: LogoSource.spaces_cache };
  } catch (err) {
    console.error(`enrichCompanyLogo: unhandled error for ${company.name}:`, err);
    await markLogoSource(company.id, LogoSource.none);
    return { logoUrl: null, source: LogoSource.none };
  }
}

/**
 * Best-effort write of `Company.logoSource` when enrichment couldn't produce
 * a logo. Failures here are non-fatal — sync continues and the next cycle
 * tries again.
 */
async function markLogoSource(id: string, source: LogoSource): Promise<void> {
  try {
    await db.company.update({
      where: { id },
      data: { logoSource: source },
    });
  } catch {
    // Non-fatal — caller is in a fire-and-forget path
  }
}

function extFromContentType(contentType: string): string {
  // Strip any "; charset=…" suffix; map MIME → file extension.
  const main = contentType.split(";")[0].trim().toLowerCase();
  switch (main) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png"; // safe fallback — browsers infer from content-type anyway
  }
}
