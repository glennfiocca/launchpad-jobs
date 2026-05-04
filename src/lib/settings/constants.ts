// Settings hub constants — externalized magic numbers and allowlists so
// every consumer (UI validation, server validation, tests) reads from one
// source of truth.

// Display name length bounds — used by both the Zod schema in IdentityForm
// and the PATCH /api/account/profile route.
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 80;

// Email change reverification flow — Phase 3.
// Token: 32 random bytes encoded as base64url (43 chars). Stored hashed.
export const EMAIL_CHANGE_TOKEN_BYTES = 32;
// 1-hour TTL keeps the window short enough to limit exposure if the
// recipient mailbox is later compromised.
export const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000;
// Per-user request rate limits: 1/min sliding to defeat email bombing,
// 5/hour to prevent annoyance even if the per-minute window is gamed.
export const EMAIL_CHANGE_RATE_PER_MINUTE = 1;
export const EMAIL_CHANGE_WINDOW_MINUTE_MS = 60 * 1000;
export const EMAIL_CHANGE_RATE_PER_HOUR = 5;
export const EMAIL_CHANGE_WINDOW_HOUR_MS = 60 * 60 * 1000;

// Phase 4 — Security & data export.
// Cap visible sign-in activity rows to keep the page snappy and bounded.
export const LOGIN_EVENTS_DISPLAY_LIMIT = 50;
// Hard cap on JSON data export size (50 MB). Exceeding this returns 413.
// The cap is checked AFTER serialization so the size accounts for any
// JSON encoding overhead (escaping, base64 of resume bytes, etc.).
export const DATA_EXPORT_MAX_BYTES = 50 * 1024 * 1024;
// 1 export per hour per user — abuse prevention. Distinct key namespace from
// email-change so the buckets don't collide.
export const DATA_EXPORT_RATE_PER_HOUR = 1;
export const DATA_EXPORT_WINDOW_HOUR_MS = 60 * 60 * 1000;
// Schema version stamped into every export. Bump when shape changes so
// downstream consumers can branch.
export const DATA_EXPORT_SCHEMA_VERSION = 1 as const;
