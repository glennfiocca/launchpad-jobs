"use client";

import { useState } from "react";
import { ProfileForm } from "./profile-form";
import { VoluntaryForm } from "./voluntary-form";
import type { UserProfile } from "@prisma/client";

export function ProfileTabs({ profile }: { profile: UserProfile | null }) {
  const [tab, setTab] = useState<"profile" | "voluntary">("profile");

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div>
      <div className="flex border-b border-slate-200 mb-6">
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
