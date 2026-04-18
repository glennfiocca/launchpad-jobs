/**
 * Minimal HMAC-SHA256 JWT implementation for fill-package tokens.
 * Uses Node's built-in crypto — no extra dependency needed.
 *
 * Token structure:
 *   header.payload.signature  (base64url-encoded, standard JWT)
 */

import { createHmac } from "crypto";

export interface FillPackagePayload {
  sub: string; // applicationId
  iss: "pipeline-admin";
  aud: "pipeline-operator-ext";
  snapshot: Record<string, unknown> & { presignedResumeUrl: string | null };
  exp: number; // unix seconds
  iat: number;
}

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function getSecret(): string {
  const secret = process.env.APPLICATION_FILL_PACKAGE_SECRET;
  if (!secret) throw new Error("APPLICATION_FILL_PACKAGE_SECRET is not configured");
  return secret;
}

export function signFillPackageToken(
  applicationId: string,
  snapshot: FillPackagePayload["snapshot"],
  ttlSeconds = 900
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: applicationId,
      iss: "pipeline-admin",
      aud: "pipeline-operator-ext",
      snapshot,
      iat: now,
      exp: now + ttlSeconds,
    } satisfies FillPackagePayload)
  );

  const signingInput = `${header}.${payload}`;
  const signature = b64url(
    createHmac("sha256", getSecret()).update(signingInput).digest()
  );

  return `${signingInput}.${signature}`;
}
