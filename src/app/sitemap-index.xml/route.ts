import { db } from "@/lib/db";

/**
 * Sitemap index at /sitemap.xml — points at chunked sitemaps.
 *
 * Why a separate route: Next.js's `generateSitemaps()` (in `app/sitemap.ts`)
 * produces only the chunk URLs `/sitemap/[id].xml`. It does NOT auto-generate
 * the parent index file at /sitemap.xml that search engines look for by
 * convention. We mint that ourselves here.
 *
 * The chunk count must stay in sync with the logic in `app/sitemap.ts` —
 * both compute `Math.ceil(activeJobCount / CHUNK_SIZE)` against the same DB.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";
const CHUNK_SIZE = 45_000;

export const dynamic = "force-dynamic";
export const revalidate = 3600;

async function getChunkCount(): Promise<number> {
  try {
    const count = await db.job.count({ where: { isActive: true } });
    return Math.max(1, Math.ceil(count / CHUNK_SIZE));
  } catch (err) {
    console.error("[sitemap-index] failed to count active jobs:", err);
    return 1;
  }
}

export async function GET(): Promise<Response> {
  const chunkCount = await getChunkCount();
  const lastmod = new Date().toISOString();

  const entries = Array.from({ length: chunkCount }, (_, id) => {
    return `  <sitemap>
    <loc>${APP_URL}/sitemap/${id}.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
