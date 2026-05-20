import type { UserProfile } from "@prisma/client";
import type { TabKey } from "@/components/profile/forms/_shared/tab-config";

// Counts of profile child rows that influence completion. Kept as a small
// struct so callers can pass partial information when only some counts have
// been queried (defaults assume zero).
export interface ProfileChildCounts {
  workExperiences?: number;
  skills?: number;
  educationEntries?: number;
  projects?: number;
  certifications?: number;
  spokenLanguages?: number;
}

// Per-section completion scores. Each axis is 0..100 and reflects the
// proportional or binary state of the tab's primary inputs (locked spec
// — see PATTERN.md). The keys mirror TAB_KEYS so the sigil + sidebar +
// next-best-action chip can index in one shot.
export type PerSectionScore = Record<TabKey, number>;

// How many days without an edit before we nudge the user to refresh.
// Consumed by the next-best-action chip and the staleness derivation.
export const STALENESS_THRESHOLD_DAYS = 30;

// Order the next-best-action chip walks when picking which axis to highlight.
// Personal / resume / professional come first because they unblock everything
// else (apply-time autofill, identity completeness for child rows).
export const NEXT_BEST_ACTION_PRIORITY: ReadonlyArray<TabKey> = [
  "personal",
  "resume",
  "professional",
  "work-history",
  "preferences",
  "skills-languages",
  "education",
  "projects-certs",
] as const;

// ---------------------------------------------------------------------------
// Shared field checks — small predicates over the slice each axis cares about.
// Extracted so the per-section + total scorers stay readable and so unit tests
// can pin individual rules without spelunking through arithmetic.
// ---------------------------------------------------------------------------

function isFilled(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function hasIdentityEssentials(
  p: Pick<UserProfile, "firstName" | "lastName" | "email" | "phone">,
): boolean {
  return Boolean(
    isFilled(p.firstName) &&
      isFilled(p.lastName) &&
      isFilled(p.email) &&
      isFilled(p.phone),
  );
}

function hasResume(p: Pick<UserProfile, "resumeData" | "resumeUrl">): boolean {
  return Boolean(p.resumeData || isFilled(p.resumeUrl));
}

function hasSummary(p: Pick<UserProfile, "summary">): boolean {
  return isFilled(p.summary);
}

function hasContact(
  p: Pick<UserProfile, "location" | "linkedinUrl" | "githubUrl" | "portfolioUrl">,
): boolean {
  return Boolean(
    isFilled(p.location) ||
      isFilled(p.linkedinUrl) ||
      isFilled(p.githubUrl) ||
      isFilled(p.portfolioUrl),
  );
}

function hasPreferences(
  p: Pick<
    UserProfile,
    | "targetRoles"
    | "desiredEmploymentTypes"
    | "desiredSalaryMin"
    | "desiredSalaryMax"
  >,
): boolean {
  const targetRoles = p.targetRoles ?? [];
  const employmentTypes = p.desiredEmploymentTypes ?? [];
  const hasSalary =
    (p.desiredSalaryMin != null && p.desiredSalaryMin > 0) ||
    (p.desiredSalaryMax != null && p.desiredSalaryMax > 0);
  return targetRoles.length > 0 || employmentTypes.length > 0 || hasSalary;
}

// Personal-axis predicates — broken out because we need a "fraction filled"
// reading, not just a boolean. Each predicate counts as one slot toward the
// proportional score.
function hasStructuredLocation(
  p: Pick<
    UserProfile,
    | "location"
    | "locationFormatted"
    | "locationCity"
    | "locationState"
    | "locationPostalCode"
    | "locationStreet"
  >,
): boolean {
  return Boolean(
    isFilled(p.location) ||
      isFilled(p.locationFormatted) ||
      isFilled(p.locationCity) ||
      isFilled(p.locationState) ||
      isFilled(p.locationPostalCode) ||
      isFilled(p.locationStreet),
  );
}

function hasAnyTopSocial(
  p: Pick<UserProfile, "linkedinUrl" | "githubUrl" | "twitterUrl">,
): boolean {
  return (
    isFilled(p.linkedinUrl) ||
    isFilled(p.githubUrl) ||
    isFilled(p.twitterUrl)
  );
}

function hasAnyCoverLetterTemplate(
  p: Pick<UserProfile, "coverLetterIntro" | "whyImLookingTemplate">,
): boolean {
  return isFilled(p.coverLetterIntro) || isFilled(p.whyImLookingTemplate);
}

// ---------------------------------------------------------------------------
// Legacy total-completion scorer — keep working so the API / Apply pane
// continue to render the same number they always have. Per-section scoring
// is additive, not a replacement.
// ---------------------------------------------------------------------------

export function computeIsComplete(
  profile: UserProfile,
  counts: ProfileChildCounts = {},
): boolean {
  if (!hasIdentityEssentials(profile)) return false;
  const workCount = counts.workExperiences ?? 0;
  return hasResume(profile) || hasSummary(profile) || workCount > 0;
}

export function computeCompletionScore(
  profile: UserProfile,
  counts: ProfileChildCounts = {},
): number {
  let score = 0;
  if (hasIdentityEssentials(profile)) score += 40;
  if (hasContact(profile)) score += 10;
  if (hasResume(profile)) score += 15;
  if (hasSummary(profile)) score += 10;
  if ((counts.workExperiences ?? 0) > 0) score += 10;
  if (hasPreferences(profile)) score += 10;
  if ((counts.skills ?? 0) > 0) score += 5;
  return Math.min(100, Math.max(0, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Per-section scorer — the input for the sigil, the sidebar status dots,
// and the next-best-action chip.
// ---------------------------------------------------------------------------

// Convert "k of n contributors are filled" → 0..100, rounded to a whole number.
// Centralized so the personal + professional axes use the same rounding.
function proportionalScore(filled: number, total: number): number {
  if (total <= 0) return 0;
  const pct = (filled / total) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

// Personal — 6 equally weighted contributors (~16.67 each). Portfolio is
// rendered in the personal tab's top-tier visual group but does NOT count
// toward this 100% per locked spec. Either of LinkedIn / GitHub / Twitter
// fulfills the "at least one URL" slot.
export interface PersonalAxisParts {
  filled: number;
  total: number;
}

export function getPersonalAxisParts(profile: UserProfile): PersonalAxisParts {
  const slots = [
    isFilled(profile.firstName),
    isFilled(profile.lastName),
    isFilled(profile.email),
    isFilled(profile.phone),
    hasStructuredLocation(profile),
    hasAnyTopSocial(profile),
  ];
  return {
    filled: slots.filter(Boolean).length,
    total: slots.length,
  };
}

// Professional — 5 equally weighted contributors (20 each).
export interface ProfessionalAxisParts {
  filled: number;
  total: number;
}

export function getProfessionalAxisParts(
  profile: UserProfile,
): ProfessionalAxisParts {
  const slots = [
    isFilled(profile.currentTitle),
    isFilled(profile.headline),
    isFilled(profile.summary),
    hasAnyTopSocial(profile),
    hasAnyCoverLetterTemplate(profile),
  ];
  return {
    filled: slots.filter(Boolean).length,
    total: slots.length,
  };
}

// Binary axes — 0 on empty, 100 on first entry. The phrasing in the sigil
// tooltips makes this explicit ("you're at 100% because you added at least
// one — adding more improves your job recommendations").
function binary(b: boolean): number {
  return b ? 100 : 0;
}

export function computePerSectionScore(
  profile: UserProfile,
  counts: ProfileChildCounts = {},
): PerSectionScore {
  const personalParts = getPersonalAxisParts(profile);
  const professionalParts = getProfessionalAxisParts(profile);

  return {
    personal: proportionalScore(personalParts.filled, personalParts.total),
    professional: proportionalScore(
      professionalParts.filled,
      professionalParts.total,
    ),
    "work-history": binary((counts.workExperiences ?? 0) > 0),
    education: binary((counts.educationEntries ?? 0) > 0),
    "skills-languages": binary(
      (counts.skills ?? 0) > 0 || (counts.spokenLanguages ?? 0) > 0,
    ),
    "projects-certs": binary(
      (counts.projects ?? 0) > 0 || (counts.certifications ?? 0) > 0,
    ),
    resume: binary(hasResume(profile)),
    preferences: binary(hasPreferences(profile)),
  };
}
