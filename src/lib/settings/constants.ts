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
