/**
 * Minimal ISO-3166-1 alpha-2 → English country name map.
 *
 * Covers ~30 of the most common job-eligibility codes. Used by the
 * eligible-countries question matcher to convert stored alpha-2 codes
 * into option labels we can match against ATS multi-selects.
 *
 * For unknown codes we return null and let callers fall back to the raw
 * string (useful when an ATS lists rare countries we haven't enumerated).
 */

const ISO_ALPHA2_TO_NAME: Readonly<Record<string, string>> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
  GB: "United Kingdom",
  IE: "Ireland",
  FR: "France",
  DE: "Germany",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  CZ: "Czech Republic",
  AU: "Australia",
  NZ: "New Zealand",
  IN: "India",
  SG: "Singapore",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  BR: "Brazil",
  AR: "Argentina",
  IL: "Israel",
  AE: "United Arab Emirates",
  ZA: "South Africa",
}

/** Convert ISO alpha-2 code to English country name, or null if unknown. */
export function isoAlpha2ToName(code: string): string | null {
  return ISO_ALPHA2_TO_NAME[code.toUpperCase()] ?? null
}

/** Convert any country identifier (ISO code or already-English name) to a label. */
export function countryLabel(input: string): string {
  return isoAlpha2ToName(input) ?? input
}

export { ISO_ALPHA2_TO_NAME }
