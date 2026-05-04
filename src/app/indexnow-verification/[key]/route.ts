// IndexNow sentinel key file route.
//
// IndexNow's recommended convention is `/<KEY>.txt` at the host root, but
// Next.js App Router does not parse `[key]` as a dynamic segment when it's
// followed by a literal extension (the segment `[key].txt` becomes a
// literal path with no params). The IndexNow protocol explicitly allows
// the `keyLocation` to be ANY URL on the same host, so we serve the key
// at `/indexnow-verification/<KEY>` instead and reference that exact URL
// in the IndexNow POST payload.
//
// Resulting keyLocation URL:
//   `https://trypipeline.ai/indexnow-verification/<INDEXNOW_KEY>`
//
// If INDEXNOW_KEY is unset, the route returns 404 unconditionally — the
// sentinel only exists when notifications are active. See
// `src/lib/seo/indexnow.ts` for the matching keyLocation construction.

import type { NextRequest } from "next/server";
import { getIndexNowKey } from "@/lib/seo/indexnow";

interface RouteContext {
  params: Promise<{ key: string }>;
}

// Always render at request time — env var lookups must happen per-request,
// not at build time (env vars are set at runtime in DigitalOcean).
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { key: requestedKey } = await ctx.params;
  const configuredKey = getIndexNowKey();

  // Env unset → no sentinel exists. Fall through to 404.
  if (!configuredKey) {
    return new Response("Not Found", { status: 404 });
  }

  // Mismatched key returns 404 to avoid leaking the existence of the key.
  if (requestedKey !== configuredKey) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(configuredKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
