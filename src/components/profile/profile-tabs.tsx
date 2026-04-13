"use client";

import { useState } from "react";
import { ProfileForm } from "./profile-form";
import { VoluntaryForm } from "./voluntary-form";
import type { UserProfile } from "@prisma/client";

export function ProfileTabs({ profile }: { profile: UserProfile | null }) {
  const [tab, setTab] = useState<"profile" | "voluntary">("profile");

  const tabClass = (active: boolean) =>
    `text-sm font-medium transition-colors border-b-2 pb-3 ${
      active
        ? "text-white border-white -mb-px font-medium"
        : "text-zinc-500 hover:text-zinc-300 border-transparent"
    }`;

  return (
    <div>
      <div className="flex gap-6 border-b border-white/8 mb-6">
        <button className={tabClass(tab === "profile")} onClick={() => setTab("profile")}>
          Profile
        </button>
        <button className={tabClass(tab === "voluntary")} onClick={() => setTab("voluntary")}>
          Voluntary ID
        </button>
      </div>
      {tab === "profile" ? (
        <ProfileForm initialData={profile} />
      ) : (
        <VoluntaryForm initialData={profile} />
      )}
    </div>
  );
}
