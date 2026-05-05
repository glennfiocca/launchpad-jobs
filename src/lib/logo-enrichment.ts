import { db } from "./db";
import { getLogoUrl } from "./logo-url";
import { uploadPublicBuffer } from "./spaces";

/**
 * Fetches a logo from logo.dev, uploads it to Spaces, and persists the CDN
 * URL to Company.logoUrl.  Returns the CDN URL on success, null otherwise.
 * Never throws — all errors are caught and logged internally.
 *
 * The Spaces step is what makes this expensive but is also what avoids
 * hitting logo.dev on every render — once cached, all readers serve from
 * our CDN. Backfill scripts re-run this when they want a refresh.
 */
export async function enrichCompanyLogo(
  company: { id: string; website: string | null; name: string }
): Promise<string | null> {
  if (!company.website) return null;

  const fetchUrl = getLogoUrl(company.website);
  if (!fetchUrl) return null;

  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.error(
        `enrichCompanyLogo: logo.dev returned ${res.status} for ${company.website}`
      );
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      console.error(
        `enrichCompanyLogo: unexpected content-type "${contentType}" for ${company.website}`
      );
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const hostname = new URL(company.website).hostname;
    const key = `logos/${hostname}.png`;

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
