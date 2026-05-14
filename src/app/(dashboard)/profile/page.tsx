import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { ProfilePageHeader } from "@/components/profile/profile-page-header";
import { computeCompletionScore } from "@/lib/profile/completeness";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  // Compute completion score client-side from related counts so the header
  // meter matches the score returned by GET /api/profile.
  let completionPercent: number | null = null;
  if (profile) {
    const [workCount, skillCount] = await Promise.all([
      db.workExperience.count({ where: { profileId: profile.id } }),
      db.skill.count({ where: { profileId: profile.id } }),
    ]);
    completionPercent = computeCompletionScore(profile, {
      workExperiences: workCount,
      skills: skillCount,
    });
  }

  return (
    <div className="bg-black">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <ProfilePageHeader completionPercent={completionPercent} />
        <ProfileTabs profile={profile} />
      </div>
    </div>
  );
}
