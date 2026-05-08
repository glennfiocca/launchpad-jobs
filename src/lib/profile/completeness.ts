import type { UserProfile } from "@prisma/client";

// Counts of profile child rows that influence completion. Kept as a small
// struct so callers can pass partial information when only some counts have
// been queried (defaults assume zero).
export interface ProfileChildCounts {
  workExperiences?: number;
  skills?: number;
}

// Identity essentials are the same set the PUT /api/profile handler treats as
// required (firstName, lastName, email). Phone is included to match the
// product spec for "complete" profiles.
function hasIdentityEssentials(p: Pick<UserProfile, "firstName" | "lastName" | "email" | "phone">): boolean {
  return Boolean(
    p.firstName?.trim() &&
      p.lastName?.trim() &&
      p.email?.trim() &&
      p.phone?.trim()
  );
}

function hasResume(p: Pick<UserProfile, "resumeData" | "resumeUrl">): boolean {
  return Boolean(p.resumeData || p.resumeUrl);
}

function hasSummary(p: Pick<UserProfile, "summary">): boolean {
  return Boolean(p.summary?.trim());
}

function hasContact(
  p: Pick<UserProfile, "location" | "linkedinUrl" | "githubUrl" | "portfolioUrl">
): boolean {
  return Boolean(
    p.location?.trim() ||
      p.linkedinUrl?.trim() ||
      p.githubUrl?.trim() ||
      p.portfolioUrl?.trim()
  );
}

function hasPreferences(
  p: Pick<UserProfile, "targetRoles" | "desiredEmploymentTypes" | "desiredSalaryMin" | "desiredSalaryMax">
): boolean {
  const targetRoles = p.targetRoles ?? [];
  const employmentTypes = p.desiredEmploymentTypes ?? [];
  const hasSalary =
    p.desiredSalaryMin != null && p.desiredSalaryMin > 0 ||
    p.desiredSalaryMax != null && p.desiredSalaryMax > 0;
  return targetRoles.length > 0 || employmentTypes.length > 0 || hasSalary;
}

// "Complete enough to apply" — identity + at least one substantive piece of
// professional context. Kept loose intentionally; tighter gating belongs in
// the apply pipeline (Phase 4).
export function computeIsComplete(
  profile: UserProfile,
  counts: ProfileChildCounts = {}
): boolean {
  if (!hasIdentityEssentials(profile)) return false;
  const workCount = counts.workExperiences ?? 0;
  return hasResume(profile) || hasSummary(profile) || workCount > 0;
}

// 0-100 weighted score surfaced on GET /api/profile. Weights tuned to reward
// the highest-signal fields (identity + resume + work history) while still
// nudging users to fill out preferences.
export function computeCompletionScore(
  profile: UserProfile,
  counts: ProfileChildCounts = {}
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
