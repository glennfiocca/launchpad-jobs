// Phase 4 — GET /api/account/data-export
//
// Synchronous JSON export of the authed user's data. Rate-limited at 1/hour
// per userId. Hard-capped at DATA_EXPORT_MAX_BYTES (50 MB) — over-cap
// returns 413 with guidance to contact support.
//
// The size check happens after JSON.stringify so it accounts for base64
// inflation of UserProfile.resumeData. If the FIRST serialization exceeds
// the cap, we drop the binary via stripResumeBinary() and re-serialize
// once. If still over (extreme edge — many MB of applications + emails),
// return 413.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/api/same-origin";
import {
  buildExportPayload,
  serializeExport,
  stripResumeBinary,
} from "@/lib/account/data-export";
import {
  DATA_EXPORT_MAX_BYTES,
  DATA_EXPORT_RATE_PER_HOUR,
  DATA_EXPORT_WINDOW_HOUR_MS,
} from "@/lib/settings/constants";

function todayYMD(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  // Same-origin gate: GET is idempotent, but the response body is a full
  // archive of the user's data. A cross-origin page that the victim visits
  // while signed in could otherwise initiate the download. The browser would
  // not let the attacker JS read the body across origins, but a `<form>` GET
  // with a chosen `target=_blank` plus a malicious same-site subdomain still
  // exposes the archive — so we refuse cross-origin entirely.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let payload;
  try {
    payload = await buildExportPayload(userId);
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    console.error(`[data-export] build failed user=${userId}: ${name}`);
    return NextResponse.json(
      { error: "Failed to build export" },
      { status: 500 },
    );
  }

  // Worst-case memory ceiling: payload object + first JSON string (≤ 50 MB) +
  // stripped payload + second JSON string concurrently in scope ≈ 100–150 MB.
  // Acceptable on standard DO instances; if we ever drop to 512 MB hosts,
  // null `json` between passes or stream the response instead.
  let { json, bytes } = serializeExport(payload);

  // First-pass cap: drop the resume binary and retry. Resume blobs are the
  // only realistic single-source of size pressure on a normal account.
  if (bytes > DATA_EXPORT_MAX_BYTES) {
    const stripped = stripResumeBinary(payload);
    ({ json, bytes } = serializeExport(stripped));
  }

  if (bytes > DATA_EXPORT_MAX_BYTES) {
    return NextResponse.json(
      { error: "Export too large. Contact support." },
      { status: 413 },
    );
  }

  // Rate-limit AFTER successful build + size-check. Internal failures (500)
  // and over-cap rejections (413) must not lock the legitimate user out for
  // an hour; the auth + same-origin gates already block anonymous abuse, and
  // 1/hour is meant to prevent accidental repeated 50 MB downloads, not act
  // as a security boundary.
  const rate = await checkRateLimit(
    `data-export:user:${userId}:hour`,
    DATA_EXPORT_RATE_PER_HOUR,
    DATA_EXPORT_WINDOW_HOUR_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Export available once per hour. Try again later." },
      { status: 429 },
    );
  }

  const filename = `pipeline-export-${userId.slice(0, 8)}-${todayYMD()}.json`;
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
