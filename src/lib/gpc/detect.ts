// Global Privacy Control (GPC) detection.
//
// CCPA/CPRA + several state laws (CO, CT, TX, OR, MT, DE) treat the
// `Sec-GPC: 1` HTTP header as a valid universal opt-out signal. The middleware
// reads the inbound spec header and re-publishes it under a non-spec name
// (`x-pipeline-gpc`) on the request headers so downstream React Server
// Components can read it via `next/headers#headers()` without the original
// `Sec-*` name causing any future CORS confusion.
//
// Spec compliance: only the exact string `"1"` is a positive GPC signal.
// Missing, "0", "true", or any other value → false.

import { headers } from "next/headers";
import { cache } from "react";
import type { NextRequest } from "next/server";

export const GPC_HEADER = "sec-gpc";
export const GPC_PROPAGATED = "x-pipeline-gpc";

// React `cache` dedupes the headers() read across a single server render.
// Next 16: headers() returns Promise<ReadonlyHeaders> — must be awaited.
//
// We accept EITHER the propagated `x-pipeline-gpc` header (set by middleware
// on routes covered by its matcher) OR the spec `Sec-GPC` header read
// directly off the request. The dual check matters because the middleware
// matcher is a finite allowlist (auth-protected routes + /api/*) and does
// NOT include the marketing root `/` — without this fallback, Plausible
// would still load on the homepage even when the browser sent Sec-GPC: 1.
export const isGpcRequest = cache(async (): Promise<boolean> => {
  const h = await headers();
  return h.get(GPC_PROPAGATED) === "1" || h.get(GPC_HEADER) === "1";
});

// Edge-runtime-safe (middleware): reads Sec-GPC directly off the incoming
// request, no React or next/headers needed.
export function readGpcFromRequest(req: NextRequest): boolean {
  return req.headers.get(GPC_HEADER) === "1";
}
