// Token primitives for the email-change reverification flow (Phase 3).
//
// The plaintext token is sent via email; only its sha256 hash lives in the
// database. That way, a DB read does not yield reusable tokens. The token is
// also single-use and time-bounded by EmailChangeRequest.expiresAt.
//
// We use timingSafeEqual for hash comparison to defeat the (admittedly
// theoretical) timing channel on row lookups — Prisma's findUnique is already
// indexed on the unique tokenHash, but defense-in-depth costs nothing.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EMAIL_CHANGE_TOKEN_BYTES } from "@/lib/settings/constants";

/** Produce a cryptographically random URL-safe token. */
export function generateEmailChangeToken(): string {
  return randomBytes(EMAIL_CHANGE_TOKEN_BYTES).toString("base64url");
}

/** SHA-256(token) hex — used as the stored DB key. Deterministic. */
export function hashEmailChangeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two hex hashes. Returns false on length
 * mismatch (no exception thrown — callers can branch cleanly).
 */
export function safeCompareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
