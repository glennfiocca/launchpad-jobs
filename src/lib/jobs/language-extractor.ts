/**
 * Extracts REQUIRED spoken-language slugs from a free-text job description.
 *
 * The match algorithm — locked Q3 spec for the Pipeline profile redesign:
 *   1. For each language token in LANGUAGE_TOKENS, find every match in the
 *      lower-cased content.
 *   2. For each match, look in a ±PROXIMITY_CHARS window around the match.
 *   3. If REQUIREMENT_WORDS matches inside that window AND PREFERENCE_WORDS
 *      does NOT match anywhere in the window, count it as required.
 *   4. Preference wins ties — "Spanish preferred but required for senior
 *      level" still skews to "preferred" because the requirement signal is
 *      conditional and we err toward fewer false-positive language gates.
 *
 * The output is a deduplicated, alphabetically sorted array of canonical
 * lowercase language slugs. The listing API's match filter uses `&&`
 * overlap against the candidate's spoken-language slugs.
 *
 * Intentionally regex-only — no NLP, no model calls. This runs synchronously
 * inside the sync pipeline (src/lib/greenhouse/sync.ts) and against ~100k
 * existing rows during the one-shot backfill
 * (scripts/backfill-job-languages.ts).
 */

const LANGUAGE_TOKENS = [
  "english",
  "spanish",
  "french",
  "german",
  "italian",
  "portuguese",
  "japanese",
  "mandarin",
  "cantonese",
  "korean",
  "arabic",
  "russian",
  "dutch",
  "swedish",
  "norwegian",
  "danish",
  "finnish",
  "polish",
  "czech",
  "hungarian",
  "romanian",
  "greek",
  "turkish",
  "hindi",
  "bengali",
  "urdu",
  "vietnamese",
  "thai",
  "indonesian",
  "malay",
  "tagalog",
  "hebrew",
  "ukrainian",
  "catalan",
  "basque",
  "welsh",
  "irish",
  "afrikaans",
  "swahili",
  "zulu",
] as const;

const REQUIREMENT_WORDS =
  /\b(required|must|fluent|speak|communicate|ability|need|proficient|native|bilingual)\b/i;
// Preference signals also include negated requirements like "not required"
// or "not a requirement" — recruiters often phrase a soft-ask that way and
// we err toward fewer false-positive language gates.
const PREFERENCE_WORDS =
  /\b(preferred|plus|nice to have|bonus|would be great|asset|optional|helpful|advantageous|not\s+(?:required|a\s+requirement|necessary|mandatory))\b/i;

// Half-width of the proximity window in characters, applied symmetrically
// around each language match. 50 chars covers typical phrasings like
// "fluent in Spanish required" or "must speak Mandarin" without bleeding
// into adjacent sentences.
const PROXIMITY_CHARS = 50;

/**
 * Returns the deduplicated, sorted set of language slugs flagged as
 * required in `content`. Returns `[]` when the input is empty, null, or
 * contains no recognized languages.
 */
export function extractRequiredLanguages(content: string): string[] {
  if (!content) return [];

  const lower = content.toLowerCase();
  const required = new Set<string>();

  for (const language of LANGUAGE_TOKENS) {
    // Word-boundary anchored regex prevents partial-word hits like
    // "polish" inside "polishing" or "thai" inside "thailand".
    const pattern = new RegExp(`\\b${language}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const start = Math.max(0, match.index - PROXIMITY_CHARS);
      const end = Math.min(
        lower.length,
        match.index + language.length + PROXIMITY_CHARS,
      );
      const window = lower.slice(start, end);

      // Preference signal wins: even a strong requirement keyword nearby
      // doesn't promote the language if the recruiter softened it.
      if (PREFERENCE_WORDS.test(window)) continue;
      if (REQUIREMENT_WORDS.test(window)) {
        required.add(language);
      }
    }
  }

  return Array.from(required).sort();
}
