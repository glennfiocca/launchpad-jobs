/**
 * Splits a free-text location string into individual location segments.
 *
 * ATS providers cram multi-location postings into a single string in
 * unpredictable ways: "New York, NY; London, UK", "SF or Remote",
 * "Berlin / Paris / London", "Boston and NYC". This module normalizes those
 * into discrete segments the classifier can evaluate independently.
 */

/**
 * Common separators used by Greenhouse + Ashby boards. Order matters: longer
 * separators are tried first so we don't split "or" out of "Coordinator".
 */
const SEPARATOR_PATTERNS: ReadonlyArray<RegExp> = [
  /\s*;\s*/,
  /\s*\|\s*/,
  /\s+\/\s+/,
  /\s+\bor\b\s+/i,
  /\s+\band\b\s+/i,
  /\s+&\s+/,
];

/**
 * Splits a location string into segments. Single-segment strings (the common
 * case) return as a one-element array. Empty/whitespace input returns an
 * empty array.
 *
 * Note: we intentionally do NOT split on commas. "San Francisco, CA" is
 * one location, and most multi-location ATS strings use semicolons or "or"
 * between regions while keeping commas inside each region.
 */
export function splitLocationSegments(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Apply separators progressively. Each split fans out segments, preserving
  // anything that didn't match the current separator.
  let segments: string[] = [trimmed];
  for (const pattern of SEPARATOR_PATTERNS) {
    const next: string[] = [];
    for (const seg of segments) {
      next.push(...seg.split(pattern));
    }
    segments = next;
  }

  return segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
