import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

// Render at request time, not build time. The DB query below depends on
// migrations that may not yet be applied during the build phase on DO
// (PRE_DEPLOY migrate runs after the docker build completes).
export const dynamic = "force-dynamic";
export const revalidate = 3600; // edge cache for 1h once requested

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";

// Per-chunk URL cap. Google accepts up to 50K URLs per sitemap; we leave
// 5K headroom for static entries on chunk 0 plus future static additions.
const CHUNK_SIZE = 45_000;

type StaticEntry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

// Static, public, non-auth pages. Keep in sync with public routes under
// src/app/(main) and src/app/auth.
const STATIC_ENTRIES: readonly StaticEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/jobs", changeFrequency: "daily", priority: 0.9 },
  { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
  { path: "/auth/signin", changeFrequency: "yearly", priority: 0.5 },
] as const;

function buildStaticEntries(now: Date): MetadataRoute.Sitemap {
  return STATIC_ENTRIES.map((entry) => ({
    url: `${APP_URL}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}

/**
 * Company hub URLs (e.g. `/companies/{slug}`). These pile into chunk 0
 * alongside the static entries.
 *
 * Sizing: even at the high-end of our pipeline (low thousands of companies),
 * companies fit comfortably below the 5K static-headroom on chunk 0 (CHUNK_SIZE
 * for jobs is 45K, leaving ~5K for static + companies under the 50K Sitemaps
 * spec cap). If/when we cross ~5K active companies, split this into a
 * dedicated companies chunk.
 *
 * Best-effort: a DB error here returns an empty array so the sitemap still
 * renders the static entries + jobs.
 */
async function buildCompanyEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const companies = await db.company.findMany({
      where: { jobs: { some: { isActive: true } } },
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true },
    });
    return companies.map((company) => ({
      url: `${APP_URL}/companies/${company.slug}`,
      lastModified: company.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch (err) {
    console.error("[sitemap] failed to load companies:", err);
    return [];
  }
}

/**
 * Tell Next.js how many sitemap chunks to emit. Next will then call the
 * default `sitemap()` export once per id and stitch a sitemap index at
 * `/sitemap.xml` pointing at `/sitemap/{id}.xml` for each chunk.
 *
 * We always return at least `[{ id: 0 }]` so the sitemap index exists
 * even when the DB is empty or unreachable (chunk 0 still serves the
 * static entries in those cases).
 */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  let activeJobCount = 0;
  try {
    activeJobCount = await db.job.count({ where: { isActive: true } });
  } catch (err) {
    console.error(
      "[sitemap] failed to count active jobs; falling back to a single chunk:",
      err,
    );
    return [{ id: 0 }];
  }

  const chunkCount = Math.max(1, Math.ceil(activeJobCount / CHUNK_SIZE));
  return Array.from({ length: chunkCount }, (_, id) => ({ id }));
}

/**
 * Render a single sitemap chunk.
 *
 * Pagination trade-off: `generateSitemaps()` invokes this function
 * independently per id with no shared state, so cursor-based pagination
 * (capturing `lastId` from chunk N to seed chunk N+1) isn't possible
 * across calls. We use offset pagination instead. Postgres `OFFSET` is
 * O(skip), which is fine up to ~100K rows but should be revisited if
 * we ever exceed ~1M active jobs (~22 chunks at 45K each).
 */
export default async function sitemap(props: {
  id: Promise<string> | string | number;
}): Promise<MetadataRoute.Sitemap> {
  // Next 16 passes `id` as `Promise<string>`. Older versions / tests may
  // pass a plain number or string, so normalize defensively.
  const rawId = await Promise.resolve(props.id);
  const chunkId = typeof rawId === "number" ? rawId : Number.parseInt(String(rawId), 10);
  const now = new Date();
  const isFirstChunk = chunkId === 0;
  const staticEntries = isFirstChunk ? buildStaticEntries(now) : [];
  // Companies live on chunk 0 alongside the static page entries.
  const companyEntries = isFirstChunk ? await buildCompanyEntries() : [];

  // DB read is best-effort — a sitemap without dynamic entries is still
  // a valid sitemap. We never want a transient DB issue to 500 the route.
  let jobs: Array<{ publicJobId: string; updatedAt: Date }> = [];
  try {
    jobs = await db.job.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      take: CHUNK_SIZE,
      skip: chunkId * CHUNK_SIZE,
      select: { publicJobId: true, updatedAt: true },
    });
  } catch (err) {
    console.error(
      `[sitemap] failed to load jobs for chunk ${chunkId}; serving ${
        isFirstChunk ? "static + company entries only" : "empty chunk"
      }:`,
      err,
    );
    return [...staticEntries, ...companyEntries];
  }

  const jobEntries: MetadataRoute.Sitemap = jobs.map((job) => ({
    url: `${APP_URL}/jobs/${job.publicJobId}`,
    lastModified: job.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Order: static page entries first, then companies, then jobs.
  return [...staticEntries, ...companyEntries, ...jobEntries];
}
