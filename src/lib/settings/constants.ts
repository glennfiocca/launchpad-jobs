// Settings hub constants — externalized magic numbers and allowlists so
// every consumer (UI validation, server validation, tests) reads from one
// source of truth.

// Avatar uploads — Phase 1 caps at 2 MB and PNG/JPEG/WEBP only. Anything
// larger or off-allowlist is rejected client-side and (independently)
// server-side.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof AVATAR_ALLOWED_MIME_TYPES)[number];

// Map from MIME type to file extension used when generating the Spaces key.
export const AVATAR_MIME_TO_EXT: Readonly<Record<AvatarMimeType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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
