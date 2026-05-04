// Deterministic avatar fallback helpers shared by the account menu trigger
// and the settings page uploader. Same seed always produces the same hue
// and initials so the trigger and the settings page stay in sync when no
// avatar image is uploaded.

// 0-359 hue from string. Stable across renders.
export function seedToHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function initialsFromSeed(seed: string): string {
  const trimmed = seed.trim();
  if (!trimmed) return "?";
  const at = trimmed.indexOf("@");
  const handle = at > 0 ? trimmed.slice(0, at) : trimmed;
  const parts = handle.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return handle.slice(0, 2).toUpperCase();
}
