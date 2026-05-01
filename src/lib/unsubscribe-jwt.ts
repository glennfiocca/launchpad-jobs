/**
 * HMAC-SHA256 token implementation for one-click email unsubscribe links.
 * Mirrors the pattern in src/lib/fill-package-jwt.ts — same b64url helpers,
 * same crypto.createHmac approach, same env var resolution pattern.
 *
 * Token structure:
 *   header.payload.signature  (base64url-encoded, standard JWT shape)
 *
 * Used for RFC 8058 / RFC 2369 List-Unsubscribe headers and footer links.
 * Long-lived (default 60 days) — recipients may keep emails around.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { NotificationType } from "@prisma/client";

export type UnsubscribeType = NotificationType | "ALL";

export interface UnsubscribeJwtPayload {
  sub: string; // userId
  iss: "pipeline-unsubscribe";
  aud: "email-recipient";
  type: UnsubscribeType;
  exp: number; // unix seconds
  iat: number;
}

const DEFAULT_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not configured");
  return secret;
}

export function signUnsubscribeToken(
  userId: string,
  type: UnsubscribeType,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      iss: "pipeline-unsubscribe",
      aud: "email-recipient",
      type,
      iat: now,
      exp: now + ttlSeconds,
    } satisfies UnsubscribeJwtPayload)
  );

  const signingInput = `${header}.${payload}`;
  const signature = b64url(
    createHmac("sha256", getSecret()).update(signingInput).digest()
  );

  return `${signingInput}.${signature}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; type: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const expected = createHmac("sha256", getSecret())
      .update(signingInput)
      .digest();
    const provided = b64urlDecode(signatureB64);

    // Constant-time compare — guard against length mismatch first since
    // timingSafeEqual throws when buffer lengths differ.
    if (provided.length !== expected.length) return null;
    if (!timingSafeEqual(provided, expected)) return null;

    const payloadJson = b64urlDecode(payloadB64).toString("utf8");
    const parsed = JSON.parse(payloadJson) as Partial<UnsubscribeJwtPayload>;

    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp < now) return null;

    return { userId: parsed.sub, type: parsed.type };
  } catch {
    return null;
  }
}
