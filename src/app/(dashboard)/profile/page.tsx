import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { ProfilePageHeader } from "@/components/profile/page-header/page-header";
import {
  computeCompletionScore,
  computePerSectionScore,
  getPersonalAxisParts,
  getProfessionalAxisParts,
  type PerSectionScore,
} from "@/lib/profile/completeness";
import {
  formatLastUpdatedAgo,
  getProfileLastUpdated,
  isProfileStale,
} from "@/lib/profile/last-updated";
import type { TabKey } from "@/components/profile/forms/_shared/tab-config";
import type { TooltipPartialContext } from "@/components/profile/sigil/sigil-tooltip-copy";

// Per-section scores default to a "zero across the board" baseline so the
// header still renders a sigil (notched-inward, but visible) before the
// user has any profile row at all.
const EMPTY_PER_SECTION: PerSectionScore = {
  personal: 0,
  professional: 0,
  "work-history": 0,
  education: 0,
  "skills-languages": 0,
  "projects-certs": 0,
  resume: 0,
  preferences: 0,
};

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  // Defaults — surfaced when profile is null (first-time user). Sigil still
  // renders with an inward-collapsed shape so the page doesn't look empty.
  let perSection: PerSectionScore = EMPTY_PER_SECTION;
  let totalPct = 0;
  let updatedAgo = "today";
  let stale = false;
  let partialContext:
    | Partial<Record<TabKey, TooltipPartialContext>>
    | undefined;

  if (profile) {
    const [
      workCount,
      skillCount,
      educationCount,
      projectCount,
      certCount,
      languageCount,
    ] = await Promise.all([
      db.workExperience.count({ where: { profileId: profile.id } }),
      db.skill.count({ where: { profileId: profile.id } }),
      db.educationEntry.count({ where: { profileId: profile.id } }),
      db.project.count({ where: { profileId: profile.id } }),
      db.certification.count({ where: { profileId: profile.id } }),
      db.spokenLanguage.count({ where: { profileId: profile.id } }),
    ]);

    const counts = {
      workExperiences: workCount,
      skills: skillCount,
      educationEntries: educationCount,
      projects: projectCount,
      certifications: certCount,
      spokenLanguages: languageCount,
    };

    perSection = computePerSectionScore(profile, counts);
    totalPct = computeCompletionScore(profile, counts);

    const lastUpdated = await getProfileLastUpdated(profile.id);
    updatedAgo = formatLastUpdatedAgo(lastUpdated);
    stale = isProfileStale(lastUpdated);

    const personalParts = getPersonalAxisParts(profile);
    const professionalParts = getProfessionalAxisParts(profile);
    partialContext = {
      personal: personalParts,
      professional: professionalParts,
    };
  }

  return (
    <div className="bg-black">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <ProfilePageHeader
          firstName={profile?.firstName ?? null}
          perSection={perSection}
          totalPct={totalPct}
          updatedAgo={updatedAgo}
          isStale={stale}
          partialContext={partialContext}
        />
        <ProfileTabs profile={profile} perSection={perSection} />
      </div>
    </div>
  );
}
