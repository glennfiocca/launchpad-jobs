/**
 * Pure location classifier — takes the signals an ATS gives us and returns
 * the bit the listing API consumes.
 *
 * Categories:
 *   US_BASED       Location is a single US site (city/state/USA).
 *   REMOTE         Remote with no foreign signal.
 *   MULTI_WITH_US  Multi-location posting where at least one segment is US.
 *   FOREIGN        Foreign-only — no US segment, no remote.
 *   UNKNOWN        Insufficient signal (rare). Surfaces as eligible by default
 *                  per product decision (permissive on unknown).
 *
 * `isUSEligible = category !== "FOREIGN"`. Always.
 */

import { hasUSSignal } from "./us-states";
import { detectForeignCountry, lookupCountryByName } from "./country-codes";
import { splitLocationSegments } from "./parse-multi";

export type LocationCategory =
  | "US_BASED"
  | "REMOTE"
  | "MULTI_WITH_US"
  | "FOREIGN"
  | "UNKNOWN";

export interface ClassifyInput {
  /** Free-text primary location, e.g. "San Francisco, CA" or "London, UK". */
  location: string | null;
  /** ATS-reported remote flag (Ashby: explicit; Greenhouse: regex on string). */
  remote: boolean;
  /**
   * Ashby-only: the structured `addressCountry` field. Verbatim from the
   * Ashby API, e.g. "United States" or "Germany". Strongest signal we have.
   */
  ashbyAddressCountry?: string | null;
  /**
   * Ashby-only: secondary location strings ("New York, NY" etc.). Used to
   * detect MULTI_WITH_US when the primary address is foreign but a US site
   * is also offered.
   */
  ashbySecondaryLocations?: ReadonlyArray<string>;
}

export interface ClassifyResult {
  category: LocationCategory;
  countryCode: string | null;
  isUSEligible: boolean;
}

export function classifyLocation(input: ClassifyInput): ClassifyResult {
  const { location, remote, ashbyAddressCountry, ashbySecondaryLocations = [] } = input;

  // 1. Ashby structured signal wins. addressCountry is reliable.
  const ashbyCountry = ashbyAddressCountry
    ? lookupCountryByName(ashbyAddressCountry)
    : undefined;

  if (ashbyCountry === "US") {
    return finish("US_BASED", "US");
  }

  if (ashbyCountry && ashbyCountry !== "US") {
    // Primary is foreign — check secondary locations for a US site.
    const hasUSSecondary = ashbySecondaryLocations.some((s) => isUSSegment(s));
    if (hasUSSecondary) return finish("MULTI_WITH_US", ashbyCountry);
    return finish("FOREIGN", ashbyCountry);
  }

  // 2. No Ashby country — fall back to free-text parsing of `location`.
  const text = (location ?? "").trim();

  // Pure remote with no location text and no foreign hint → REMOTE.
  if (remote && !text) {
    return finish("REMOTE", null);
  }

  // No text and no remote → genuinely unknown.
  if (!text) {
    return finish("UNKNOWN", null);
  }

  const segments = splitLocationSegments(text);

  // Single-segment path — common case.
  if (segments.length <= 1) {
    return classifySingleSegment(segments[0] ?? text, remote);
  }

  // Multi-segment path. Classify each, then aggregate.
  const seen: LocationCategory[] = [];
  let firstForeignCountry: string | null = null;

  for (const seg of segments) {
    const r = classifySingleSegment(seg, remote);
    seen.push(r.category);
    if (r.category === "FOREIGN" && r.countryCode && !firstForeignCountry) {
      firstForeignCountry = r.countryCode;
    }
  }

  const hasUS = seen.some((c) => c === "US_BASED" || c === "REMOTE" || c === "MULTI_WITH_US");
  const hasForeign = seen.some((c) => c === "FOREIGN");

  if (hasUS && hasForeign) return finish("MULTI_WITH_US", firstForeignCountry);
  if (hasUS) return finish("US_BASED", "US");
  if (hasForeign) return finish("FOREIGN", firstForeignCountry);
  return finish("UNKNOWN", null);
}

function classifySingleSegment(segment: string, remote: boolean): ClassifyResult {
  const trimmed = segment.trim();
  if (!trimmed) return finish(remote ? "REMOTE" : "UNKNOWN", null);

  const looksRemote = remote || /\bremote\b/i.test(trimmed);
  const us = isUSSegment(trimmed);
  const foreignCode = detectForeignCountry(trimmed);

  // "Remote (US)", "US Remote", or any remote string that mentions a US signal.
  if (looksRemote && us) return finish("REMOTE", "US");

  // US signal present, no foreign signal — US-based.
  if (us && !foreignCode) return finish("US_BASED", "US");

  // Foreign signal present, no US signal — foreign.
  if (foreignCode && !us) return finish("FOREIGN", foreignCode);

  // Both present in one segment (rare, e.g. "Remote, US/UK") — treat as MULTI.
  if (us && foreignCode) return finish("MULTI_WITH_US", foreignCode);

  // Pure remote with no country anchor.
  if (looksRemote) return finish("REMOTE", null);

  return finish("UNKNOWN", null);
}

function isUSSegment(segment: string): boolean {
  return hasUSSignal(segment);
}

function finish(category: LocationCategory, countryCode: string | null): ClassifyResult {
  return {
    category,
    countryCode,
    isUSEligible: category !== "FOREIGN",
  };
}
