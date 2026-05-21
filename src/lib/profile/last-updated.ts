import { db } from "@/lib/db";
import { STALENESS_THRESHOLD_DAYS } from "./completeness";

/**
 * "Last updated" derivation for a profile.
 *
 * The number displayed in the page header / next-best-action chip is the MAX
 * of UserProfile.updatedAt and every child-row updatedAt (Skill,
 * WorkExperience, EducationEntry, Project, Certification, SpokenLanguage),
 * so editing a single skill bumps the headline timestamp the way the user
 * expects. Computed server-side and passed down as a Date.
 */

interface UpdatedAtRow {
  readonly updatedAt: Date;
}

// Tiny helper — fetch ONLY the updatedAt for the most recently touched row in
// a given child table, scoped to the profile. Six queries running in parallel
// stay cheap; switching to a UNION ALL view felt like overkill for a header
// timestamp.
async function maxUpdatedAt(
  rows: ReadonlyArray<UpdatedAtRow>,
): Promise<Date | null> {
  if (rows.length === 0) return null;
  return rows[0].updatedAt;
}

export async function getProfileLastUpdated(profileId: string): Promise<Date> {
  const [
    profile,
    skill,
    work,
    education,
    project,
    certification,
    spokenLanguage,
  ] = await Promise.all([
    db.userProfile.findUnique({
      where: { id: profileId },
      select: { updatedAt: true },
    }),
    db.skill.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
    db.workExperience.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
    db.educationEntry.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
    db.project.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
    db.certification.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
    db.spokenLanguage.findMany({
      where: { profileId },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { updatedAt: true },
    }),
  ]);

  const candidates: Array<Date | null> = [
    profile?.updatedAt ?? null,
    await maxUpdatedAt(skill),
    await maxUpdatedAt(work),
    await maxUpdatedAt(education),
    await maxUpdatedAt(project),
    await maxUpdatedAt(certification),
    await maxUpdatedAt(spokenLanguage),
  ];

  const max = candidates
    .filter((d): d is Date => d instanceof Date)
    .reduce((acc, d) => (d.getTime() > acc.getTime() ? d : acc), new Date(0));

  // Fallback: if literally nothing has ever been written for this profile id
  // (shouldn't happen, but defensive), return the current time so the page
  // doesn't display "1970".
  return max.getTime() === 0 ? new Date() : max;
}

// "today" / "12d" / "5mo" / "2y+". Pluralization is implicit — `12d` reads
// the same in singular and plural, so we keep the compact form throughout.
export function formatLastUpdatedAgo(date: Date): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(diffMs / day);

  if (diffDays === 0) return "today";
  if (diffDays < 30) return `${diffDays}d`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears}y+`;
}

export function isProfileStale(date: Date): boolean {
  const now = Date.now();
  const diffDays = Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= STALENESS_THRESHOLD_DAYS;
}
