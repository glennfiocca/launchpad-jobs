/**
 * Pure name-normalization helpers. No DB, no I/O — fully unit-testable.
 *
 * The resolver layers these on top of a curated override map; this file is
 * the fallback path for companies we haven't hand-tuned.
 */

// Tokens that should be all-caps when they appear as a standalone word.
// Matched case-insensitively against split words. Keep this list tight —
// over-eager acronym lists turn "Beam" into "BEAM".
const ACRONYMS = new Set([
  "ai",
  "ml",
  "io",
  "ar",
  "vr",
  "ui",
  "ux",
  "api",
  "sdk",
  "saas",
  "paas",
  "iaas",
  "hr",
  "it",
  "qa",
  "ev",
  "iot",
  "aws",
  "gcp",
  "tv",
  "fm",
  "pr",
  "cx",
  "crm",
  "erp",
  "llc",
  "inc",
  "usa",
  "uk",
  "eu",
  "us",
  "nyc",
  "la",
  "sf",
]);

// Joiner words that stay lowercase except at the start of the string.
const LOWER_JOINERS = new Set([
  "of",
  "the",
  "and",
  "for",
  "in",
  "on",
  "at",
  "to",
  "by",
  "a",
  "an",
]);

// Inc/LLC-style suffixes we strip when normalizing a malformed token.
// The leading separator is REQUIRED — we don't want to strip "corp" from
// "Acmecorp" or "inc" from anything mid-word.
const TRAILING_SUFFIXES = [
  /[,\s]+inc\.?$/i,
  /[,\s]+llc\.?$/i,
  /[,\s]+ltd\.?$/i,
  /[,\s]+corp\.?$/i,
  /[,\s]+corporation$/i,
];

export function stripCorporateSuffix(name: string): string {
  let result = name.trim();
  for (const re of TRAILING_SUFFIXES) {
    result = result.replace(re, "");
  }
  return result.trim();
}

/**
 * Title-case a single word with acronym + joiner awareness.
 * `position` controls whether joiners stay lowercase (anywhere but the start).
 */
function titleCaseWord(word: string, position: "first" | "rest"): string {
  if (!word) return word;
  const lower = word.toLowerCase();

  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (position === "rest" && LOWER_JOINERS.has(lower)) return lower;

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Smart title-case that preserves acronyms and lowercases joiner words.
 * Splits on whitespace + hyphens; preserves the original separator.
 *
 * Examples:
 *   "openai"            -> "Openai"          (no embedded acronym hint)
 *   "open ai"           -> "Open AI"
 *   "scale ai"          -> "Scale AI"
 *   "bank of america"   -> "Bank of America"
 *   "DataDog"           -> "Datadog"         (caller decides to invoke this)
 */
export function smartTitleCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Split while preserving separators so we can re-join faithfully.
  const tokens = trimmed.split(/(\s+|-)/);
  let firstWordSeen = false;

  return tokens
    .map((tok) => {
      if (/^\s+$/.test(tok) || tok === "-") return tok;
      const position: "first" | "rest" = firstWordSeen ? "rest" : "first";
      firstWordSeen = true;
      return titleCaseWord(tok, position);
    })
    .join("");
}

/**
 * Heuristic: does this name look malformed enough that we should rewrite it?
 *
 * "Looks fine" means the caller should leave it alone. Examples that look
 * fine: "Anthropic", "OpenAI", "DoorDash", "1stDibs". Examples that look
 * malformed: "openai", "ANTHROPIC", "scale-ai".
 */
export function looksMalformed(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;

  // All-lowercase letters (allowing digits/punctuation) — bad.
  if (/^[a-z0-9.\-_\s]+$/.test(trimmed) && /[a-z]/.test(trimmed)) return true;

  // All-uppercase letters with length > 4 — likely SHOUTING, not an acronym.
  // Length cap avoids flipping legitimate acronyms like "IBM" or "EQT".
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 4 && letters === letters.toUpperCase()) return true;

  // Contains hyphen between lowercase words — bad ("scale-ai").
  if (/[a-z]-[a-z]/.test(trimmed)) return true;

  return false;
}

/**
 * Convenience: normalize a name end-to-end using only the heuristic path.
 * The resolver invokes this as the last-resort fallback.
 *
 * Hyphens are converted to spaces because the malformed-name path is dominated
 * by slug-shaped inputs (e.g. "pylon-labs" -> "Pylon Labs"). Brand names with
 * intentional hyphens (e.g. "d-Matrix") need an explicit override anyway.
 */
export function normalizeName(input: string): string {
  const stripped = stripCorporateSuffix(input);
  const candidate = (stripped || input).replace(/-/g, " ");
  return smartTitleCase(candidate);
}
