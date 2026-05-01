import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";

// Cap dynamic job entries per sitemap. Search engines accept up to 50K URLs
// per sitemap, but we keep a conservative cap to bound DB reads + payload size.
const JOB_SITEMAP_CAP = 5000;

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const jobs = await db.job.findMany({
    where: { isActive: true },
    orderBy: { postedAt: "desc" },
    take: JOB_SITEMAP_CAP,
    select: { publicJobId: true, updatedAt: true },
  });

  if (jobs.length >= JOB_SITEMAP_CAP) {
    // Soft warning — when this fires, switch to `generateSitemaps` to chunk.
    console.warn(
      `[sitemap] active job count hit cap of ${JOB_SITEMAP_CAP}; consider sharding via generateSitemaps`,
    );
  }

  const jobEntries: MetadataRoute.Sitemap = jobs.map((job) => ({
    url: `${APP_URL}/jobs/${job.publicJobId}`,
    lastModified: job.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...buildStaticEntries(now), ...jobEntries];
}
