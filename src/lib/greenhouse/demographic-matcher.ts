/**
 * Shared matcher for Greenhouse demographic (EEOC) form fields.
 * Provides tiered matching: explicit exact -> decline fallback.
 *
 * Canonical source — the extension (content.js) duplicates normalizeText
 * and DECLINE_PATTERNS. Keep both in sync.
 */

// --- Types ---

export interface DemographicOption {
  readonly id: string | number;
  readonly label: string;
}

export type MatchMode =
  | "explicit_exact"
  | "decline_fallback"
  | "no_match";

export interface MatchResult {
  readonly optionId: string | number | null;
  readonly label: string | null;
  readonly mode: MatchMode;
  readonly warning?: string;
}

// --- Normalization ---

/** Lowercase, trim, collapse whitespace, strip punctuation (keep letters/digits/spaces). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\u2018\u2019\u2032\u0060]/g, "'") // smart/curly quotes -> straight
    .replace(/[-/]/g, " ")                         // hyphens/slashes -> spaces (preserve word boundaries)
    .replace(/[^\w\s]/g, "")                       // strip remaining punctuation
    .replace(/\s+/g, " ");                         // collapse whitespace
}

// --- Decline patterns (normalized form) ---

export const DECLINE_PATTERNS: readonly string[] = [
  "decline to self identify",
  "i dont wish to answer",
  "i do not wish to answer",
  "i do not want to answer",
  "choose not to answer",
  "prefer not to say",
  "prefer not to answer",
  "choose not to disclose",
  "decline to identify",
  "decline to state",
] as const;

// --- Matcher ---

/**
 * Match a profile value to a form option, with decline fallback.
 *
 * Tier 1: If profileValue is non-null, find option with exact normalized match.
 * Tier 2: Find a single decline-like option as fallback.
 *
 * Never selects a substantive answer when declining is intended.
 */
export function matchDemographicOption(
  options: readonly DemographicOption[],
  profileValue: string | null | undefined,
  category: string,
): MatchResult {
  // Tier 1: explicit exact match
  if (profileValue) {
    const normProfile = normalizeText(profileValue);
    const match = options.find(
      (opt) => normalizeText(opt.label) === normProfile,
    );
    if (match) {
      return { optionId: match.id, label: match.label, mode: "explicit_exact" };
    }
  }

  // Tier 2: decline fallback
  const declineMatches = options.filter((opt) =>
    DECLINE_PATTERNS.includes(normalizeText(opt.label)),
  );

  if (declineMatches.length === 1) {
    return {
      optionId: declineMatches[0].id,
      label: declineMatches[0].label,
      mode: "decline_fallback",
    };
  }

  if (declineMatches.length > 1) {
    const labels = declineMatches.map((o) => o.label).join(", ");
    return {
      optionId: null,
      label: null,
      mode: "no_match",
      warning: `Multiple decline options found for ${category}: ${labels}`,
    };
  }

  return { optionId: null, label: null, mode: "no_match" };
}
