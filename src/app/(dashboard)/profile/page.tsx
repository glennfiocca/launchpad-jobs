import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileTabs } from "@/components/profile/profile-tabs";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="bg-black min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Your Profile</h1>
          <p className="text-zinc-400 mt-1">
            Fill this out once. We&apos;ll use it to automatically apply to jobs for you.
          </p>
        </div>
        <ProfileTabs profile={profile} />
      </div>
    </div>
  );
}
