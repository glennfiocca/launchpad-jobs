/**
 * Pure scoring helpers for the company-website verification audit.
 *
 * Used by `scripts/verify-company-websites.ts` to compute a fuzzy
 * similarity between a Company.name and brand signals extracted from
 * the company's homepage (title, og:site_name, etc.).
 *
 * The scorer uses **token Jaccard**: tokenize after stripping non-
 * alphanumerics, then |A ∩ B| / |A ∪ B|. Cheap, dependency-free,
 * good enough to surface obvious mismatches.
 */

/**
 * Lowercase, replace any non-alphanumeric run with a single space, trim,
 * and split on whitespace. Returns the unique token set as a Set<string>.
 *
 * Empty / null inputs yield an empty set so the caller can short-circuit.
 */
export function tokenize(input: string | null | undefined): Set<string> {
  if (!input) return new Set();
  // Replace non-alphanumeric (incl. unicode punctuation like middle-dot
  // and em-dash that brands love in their titles) with a space.
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return new Set();
  return new Set(normalized.split(/\s+/));
}

/**
 * Token-set Jaccard similarity in [0, 1].
 * Returns 0 when either side is empty (no signal = no match).
 */
export function jaccardSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const tok of ta) if (tb.has(tok)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type SignalSource = "title" | "og:site_name" | "application-name" | "json-ld";

export interface Signal {
  readonly source: SignalSource;
  readonly value: string;
}

export interface BestSignal {
  readonly source: SignalSource | null;
  readonly value: string | null;
  readonly score: number;
}

/**
 * Score every signal against companyName, return the winner.
 * If `signals` is empty, score is 0 and source/value are null.
 */
export function bestSignalScore(
  companyName: string,
  signals: readonly Signal[],
): BestSignal {
  let best: BestSignal = { source: null, value: null, score: 0 };
  for (const s of signals) {
    const score = jaccardSimilarity(companyName, s.value);
    if (score > best.score) {
      best = { source: s.source, value: s.value, score };
    }
  }
  return best;
}
