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
export const isGpcRequest = cache(async (): Promise<boolean> => {
  const h = await headers();
  return h.get(GPC_PROPAGATED) === "1";
});

// Edge-runtime-safe (middleware): reads Sec-GPC directly off the incoming
// request, no React or next/headers needed.
export function readGpcFromRequest(req: NextRequest): boolean {
  return req.headers.get(GPC_HEADER) === "1";
}
