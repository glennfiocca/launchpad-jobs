import { db } from "./db";
import { getLogoUrl, type LogoTheme } from "./logo-url";
import { uploadPublicBuffer } from "./spaces";

interface EnrichInput {
  id: string;
  website: string | null;
  name: string;
  /** Used as the Spaces key for explicit-source-URL overrides. */
  slug?: string;
}

interface EnrichOptions {
  /** Pass the logo.dev variant when deriving the URL from website. */
  theme?: LogoTheme;
  /**
   * Override the fetch source. When provided, this URL is fetched verbatim
   * instead of building one from `company.website` + theme. The downloaded
   * bytes are uploaded to Spaces under `logos/manual/{slug}.png` so manual
   * overrides don't collide with hostname-keyed cache entries and are
   * stable across website changes.
   */
  sourceUrl?: string;
}

/**
 * Fetches a logo image (from logo.dev by default, or a caller-supplied URL)
 * and uploads it to DigitalOcean Spaces. Persists the resulting CDN URL to
 * `Company.logoUrl`. Returns the CDN URL on success, null otherwise.
 * Never throws — all errors are caught and logged internally.
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
): Promise<string | null> {
  const fetchUrl =
    options?.sourceUrl ??
    (company.website ? getLogoUrl(company.website, options?.theme) : null);
  if (!fetchUrl) return null;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.error(
        `enrichCompanyLogo: ${res.status} fetching ${fetchUrl} for ${company.name}`,
      );
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      console.error(
        `enrichCompanyLogo: unexpected content-type "${contentType}" for ${company.name}`,
      );
      return null;
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
      return null;
    }

    const cdnUrl = await uploadPublicBuffer(key, buffer, contentType);
    if (!cdnUrl) return null;

    await db.company.update({
      where: { id: company.id },
      data: { logoUrl: cdnUrl },
    });

    return cdnUrl;
  } catch (err) {
    console.error(`enrichCompanyLogo: unhandled error for ${company.name}:`, err);
    return null;
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
