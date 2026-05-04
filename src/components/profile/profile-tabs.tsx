"use client";

import { ProfileForm } from "./profile-form";
import type { UserProfile } from "@prisma/client";

export function ProfileTabs({ profile }: { profile: UserProfile | null }) {
  return <ProfileForm initialData={profile} />;
}
