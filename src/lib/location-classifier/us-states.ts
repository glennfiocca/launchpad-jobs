/**
 * US state + territory abbreviations and full names, plus a curated list of
 * unambiguous US cities. Used by the location classifier to detect US-based
 * locations from free-text strings.
 *
 * Curation principles:
 * - Two-letter abbreviations are matched as standalone tokens only (so "CA"
 *   matches "San Francisco, CA" but not "CAFE").
 * - Full names match case-insensitively as standalone tokens.
 * - The unambiguous-cities list is intentionally small. Cities that exist
 *   outside the US (Portland, Birmingham, Cambridge) are excluded —
 *   classification falls through to the state regex or the foreign-only path.
 */

export const US_STATE_ABBREVIATIONS: ReadonlyArray<string> = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
];

export const US_STATE_FULL_NAMES: ReadonlyArray<string> = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas",
  "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana",
  "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
  "District of Columbia", "Puerto Rico",
];

/**
 * Cities that are unambiguously in the US. A location string containing any
 * of these (as a whole-word match) is classified as US-based even without
 * a state abbreviation — common in informal Greenhouse strings like "NYC" or
 * "Seattle".
 *
 * Excluded on purpose: Portland (Maine vs Oregon — fine, both US, but the
 * name also exists abroad), Birmingham (UK), Cambridge (UK + MA), Sydney
 * (AU + NS), London (UK + ON), Paris (FR + TX), Manchester (UK + NH).
 * For those, the classifier needs the state qualifier.
 */
export const UNAMBIGUOUS_US_CITIES: ReadonlyArray<string> = [
  "New York City",
  "NYC",
  "San Francisco",
  "Los Angeles",
  "Chicago",
  "Boston",
  "Seattle",
  "Austin",
  "Denver",
  "Atlanta",
  "Dallas",
  "Houston",
  "Philadelphia",
  "Phoenix",
  "Miami",
  "Minneapolis",
  "Detroit",
  "Baltimore",
  "Milwaukee",
  "Pittsburgh",
  "Sacramento",
  "Oakland",
  "Brooklyn",
  "Manhattan",
  "Queens",
  "Bronx",
  "Silicon Valley",
  "Bay Area",
  "Mountain View",
  "Palo Alto",
  "Menlo Park",
  "Sunnyvale",
  "Cupertino",
  "Redwood City",
  "Santa Monica",
  "San Jose",
  "San Diego",
  "Las Vegas",
  "Salt Lake City",
  "Kansas City",
  "St. Louis",
  "Saint Louis",
  "New Orleans",
  "Nashville",
  "Tampa",
  "Orlando",
  "Jacksonville",
  "Charlotte",
  "Raleigh",
  "Durham",
  "Indianapolis",
  "Cleveland",
  "Cincinnati",
  "Columbus",
  "Tucson",
  "Albuquerque",
  "Boulder",
  "Burlington",
  "Hartford",
  "Princeton",
  "Ithaca",
];

/**
 * Generic phrases that strongly indicate a US-based or US-only role even
 * without a state/city qualifier. Matched case-insensitively as substrings.
 */
export const US_PHRASE_HINTS: ReadonlyArray<string> = [
  "United States",
  "USA",
  "U.S.A.",
  "U.S.",
  " US ",
  "Remote - US",
  "Remote, US",
  "Remote (US)",
  "Remote (United States)",
  "US Remote",
  "US-Remote",
  "Anywhere in the US",
  "Anywhere in the United States",
  "Nationwide",
  "Coast to Coast",
  "America",
  "American",
];

/**
 * Pre-compiled regex set built once at module load. Each entry matches a
 * single US-state abbreviation as a whole-word token. Combined with the
 * full-name and city checks, this is what the classifier consults.
 */
const STATE_ABBREV_PATTERN = new RegExp(
  `\\b(${US_STATE_ABBREVIATIONS.join("|")})\\b`,
  "i",
);
const STATE_FULL_PATTERN = new RegExp(
  `\\b(${US_STATE_FULL_NAMES.map((s) => s.replace(/\s/g, "\\s+")).join("|")})\\b`,
  "i",
);
const CITY_PATTERN = new RegExp(
  `\\b(${UNAMBIGUOUS_US_CITIES.map((c) =>
    c.replace(/\./g, "\\.?").replace(/\s/g, "\\s+"),
  ).join("|")})\\b`,
  "i",
);
const PHRASE_PATTERN = new RegExp(
  US_PHRASE_HINTS.map((p) => p.replace(/[()[\]\\.+*?^${}|]/g, "\\$&")).join("|"),
  "i",
);

/**
 * Returns true if the string contains any US-location signal: a state
 * abbreviation, a full state name, an unambiguous US city, or a US phrase.
 */
export function hasUSSignal(input: string): boolean {
  if (!input) return false;
  return (
    STATE_ABBREV_PATTERN.test(input) ||
    STATE_FULL_PATTERN.test(input) ||
    CITY_PATTERN.test(input) ||
    PHRASE_PATTERN.test(input)
  );
}
