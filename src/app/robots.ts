import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai";

// Paths that should never be indexed by search engines.
// Keep in sync with the route groups in src/app — non-public surfaces only.
const DISALLOWED_PATHS = [
  "/admin/",
  "/api/",
  "/auth/",
  "/settings/",
  "/dashboard/",
  "/applications/",
  "/unsubscribe",
  "/onboarding/",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PATHS],
    },
    // We host the sitemap index at /sitemap-index.xml because Next.js's
    // file-based `app/sitemap.ts` with `generateSitemaps()` claims the
    // /sitemap.xml URL but only serves chunk URLs — there's no auto-built
    // index. Search engines discover via this directive, not by convention.
    sitemap: `${APP_URL}/sitemap-index.xml`,
  };
}
