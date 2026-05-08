/**
 * Shared ATS question-pattern registry.
 *
 * Phase 4 of the profile expansion centralizes new question matchers
 * (notice period, earliest start, compliance, languages, etc.) so the
 * Greenhouse + Ashby paths and the browser extension all consult the
 * same source of truth.
 *
 * Existing matchers in `src/lib/ats/question-matcher.ts` and
 * `src/lib/greenhouse/questions.ts` are intentionally NOT moved here —
 * they tangle with provider-specific selectValue lookup. The registry
 * adds new branches additively.
 */

import { countryLabel } from "@/lib/iso-countries"
import type { NormalizedFieldType } from "./types"

// ─── Profile shape consumed by the registry ──────────────────────────────────
//
// Re-uses the shape in QuestionMatchProfile but adds the Phase-1 expansion
// scalars + child collections we now reach for. Kept structural so server
// code (full UserProfile + relations) and the apply-modal shim (scalars
// only) can both pass.

export interface ExtendedMatchProfile {
  noticePeriodWeeks?: number | null
  earliestStartDate?: Date | string | null
  hasDriversLicense?: boolean | null
  willingBackgroundCheck?: boolean | null
  willingDrugTest?: boolean | null
  securityClearance?: string | null
  searchStatus?: string | null
  coverLetterIntro?: string | null
  whyImLookingTemplate?: string | null
  spokenLanguages?: ReadonlyArray<{ name: string }>
  eligibleCountries?: ReadonlyArray<string>
}

// ─── Alias maps ──────────────────────────────────────────────────────────────

/** Map enum value → human-readable option label for selects. */
const SECURITY_CLEARANCE_LABELS: Readonly<Record<string, string>> = {
  none: "None",
  confidential: "Confidential",
  secret: "Secret",
  "top-secret": "Top Secret",
}

/** Search-status enum → option label. */
const SEARCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  "actively-looking": "Actively looking",
  open: "Open to opportunities",
  "not-looking": "Not looking",
}

// ─── Resolve helpers ─────────────────────────────────────────────────────────

function isoDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function yesNoString(b: boolean | null | undefined): string | null {
  if (b == null) return null
  return b ? "yes" : "no"
}

// ─── Pattern entry ───────────────────────────────────────────────────────────

export interface QuestionPattern {
  id: string
  pattern: RegExp
  /**
   * Hint about what kind of input this pattern targets. Useful so matcher
   * implementations can short-circuit (e.g. skip a "yesno" pattern when
   * the underlying field is a number).
   */
  fieldType: "text" | "number" | "date" | "yesno" | "select" | "multiselect"
  /**
   * Resolve the answer from the profile. Returns null when the profile
   * does not have a value (callers should treat null as "no answer").
   *
   * For multiselect patterns the resolver returns an array of label
   * strings; the matcher is responsible for resolving each label to an
   * option value within the host ATS.
   */
  resolve(profile: ExtendedMatchProfile): string | string[] | null
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const QUESTION_PATTERNS: ReadonlyArray<QuestionPattern> = [
  {
    id: "notice-period",
    pattern: /notice period|how much notice|when can you start.*notice/i,
    fieldType: "number",
    resolve: (p) =>
      p.noticePeriodWeeks != null ? String(p.noticePeriodWeeks) : null,
  },
  {
    id: "earliest-start",
    pattern: /earliest.*start|start date|available.*start|when can you start/i,
    fieldType: "date",
    resolve: (p) => isoDateOnly(p.earliestStartDate),
  },
  {
    id: "drivers-license",
    pattern: /driver'?s? license|valid license/i,
    fieldType: "yesno",
    resolve: (p) => yesNoString(p.hasDriversLicense),
  },
  {
    id: "background-check",
    pattern: /background check|consent.*background/i,
    fieldType: "yesno",
    resolve: (p) => yesNoString(p.willingBackgroundCheck),
  },
  {
    id: "drug-test",
    pattern: /drug (test|screen)/i,
    fieldType: "yesno",
    resolve: (p) => yesNoString(p.willingDrugTest),
  },
  {
    id: "security-clearance",
    pattern: /security clearance|clearance level/i,
    fieldType: "select",
    resolve: (p) => {
      if (!p.securityClearance) return null
      return SECURITY_CLEARANCE_LABELS[p.securityClearance] ?? p.securityClearance
    },
  },
  {
    id: "search-status",
    pattern:
      /job search status|currently (employed|looking)|are you (actively )?(looking|searching)/i,
    fieldType: "select",
    resolve: (p) => {
      if (!p.searchStatus) return null
      return SEARCH_STATUS_LABELS[p.searchStatus] ?? p.searchStatus
    },
  },
  {
    id: "languages-spoken",
    pattern:
      /language(s)? (you )?(speak|spoken)|spoken languages|fluent in/i,
    fieldType: "multiselect",
    resolve: (p) => {
      const list = p.spokenLanguages ?? []
      if (list.length === 0) return null
      return list.map((l) => l.name)
    },
  },
  {
    id: "work-eligibility-countries",
    pattern:
      /countr(y|ies).*authorized|authorized to work.*countr|which countries.*work|where.*authorized/i,
    fieldType: "multiselect",
    resolve: (p) => {
      const codes = p.eligibleCountries ?? []
      if (codes.length === 0) return null
      return codes.map((c) => countryLabel(c))
    },
  },
  {
    id: "cover-letter-intro",
    pattern:
      /cover letter|why are you interested|tell us about yourself|why.*you.*apply/i,
    fieldType: "text",
    resolve: (p) => p.coverLetterIntro ?? null,
  },
]

// ─── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Find the first registry entry whose pattern matches `label`. Returns null
 * when no pattern matches.
 *
 * Note: callers should still gate on `entry.fieldType` against the host
 * field's actual type to avoid e.g. answering a yesno pattern with "yes"
 * inside a number input.
 */
export function findPattern(label: string): QuestionPattern | null {
  for (const entry of QUESTION_PATTERNS) {
    if (entry.pattern.test(label)) return entry
  }
  return null
}

/**
 * Match a single normalized question against the registry and resolve an
 * answer string from the profile. Returns null if no pattern matches OR
 * the profile does not have a value OR the host field type is not
 * compatible with the registry hint (e.g. registry says "yesno" but the
 * field is a number input).
 *
 * For multiselect resolvers, this returns the resolved labels joined by
 * comma — Greenhouse's snapshot stores multi-value answers as
 * comma-joined ID strings, but here we return labels for callers that
 * need to resolve labels → option values themselves.
 */
export function resolveFromRegistry(
  label: string,
  hostFieldType: NormalizedFieldType,
  profile: ExtendedMatchProfile
): string | string[] | null {
  const entry = findPattern(label)
  if (!entry) return null
  if (!isCompatible(entry.fieldType, hostFieldType)) return null
  return entry.resolve(profile)
}

function isCompatible(
  registryType: QuestionPattern["fieldType"],
  hostType: NormalizedFieldType
): boolean {
  // text patterns can drop into text/textarea fields
  if (registryType === "text") return hostType === "text" || hostType === "textarea"
  if (registryType === "number") return hostType === "number" || hostType === "text"
  if (registryType === "date") return hostType === "date" || hostType === "text"
  if (registryType === "yesno")
    return hostType === "select" || hostType === "boolean"
  if (registryType === "select") return hostType === "select"
  if (registryType === "multiselect")
    return hostType === "multiselect" || hostType === "select"
  return false
}
