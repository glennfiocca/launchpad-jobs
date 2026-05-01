/**
 * URL + header helpers for one-click unsubscribe.
 * Implements RFC 8058 (one-click) + RFC 2369 (List-Unsubscribe) compliant
 * header values used by Gmail/Yahoo bulk-sender requirements.
 */

import { signUnsubscribeToken, type UnsubscribeType } from "@/lib/unsubscribe-jwt";

// Read NEXT_PUBLIC_APP_URL on each call rather than at module load — it lets
// tests override the value via process.env without forcing module re-evaluation
// and matches how server-side env reads work in Next.js route handlers.
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildUnsubscribeUrl(
  userId: string,
  type: UnsubscribeType
): string {
  const token = signUnsubscribeToken(userId, type);
  return `${getAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Use a type alias with an index signature so the value is structurally
// assignable to Resend's `headers: Record<string, string>` field while still
// guaranteeing the two required keys exist.
export type ListUnsubscribeHeaders = Record<string, string> & {
  "List-Unsubscribe": string;
  "List-Unsubscribe-Post": string;
};

/**
 * Returns the RFC 8058 / RFC 2369 header pair for a one-click unsubscribe.
 * The List-Unsubscribe value must be wrapped in angle-brackets.
 * The List-Unsubscribe-Post value is fixed per RFC 8058.
 */
export function buildListUnsubscribeHeaders(
  userId: string,
  type: UnsubscribeType
): ListUnsubscribeHeaders {
  const url = buildUnsubscribeUrl(userId, type);
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
