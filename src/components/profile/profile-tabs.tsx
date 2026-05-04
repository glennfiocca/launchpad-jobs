"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { PersonalForm } from "./forms/personal-form";
import { ProfessionalForm } from "./forms/professional-form";
import { EducationForm } from "./forms/education-form";
import { ResumeForm } from "./forms/resume-form";
import { PreferencesForm } from "./forms/preferences-form";
import {
  DEFAULT_TAB,
  isTabKey,
  TAB_KEYS,
  TAB_LABELS,
  type TabKey,
} from "./forms/_shared/tab-config";

interface ProfileTabsProps {
  profile: UserProfile | null;
}

// Active-state styling preserves the underline indicator from the previous
// home-rolled tab nav: 2px white border on the active trigger, transparent
// otherwise. data-[state=active] is set automatically by Radix.
const triggerClass =
  "relative px-4 py-2.5 text-sm font-medium text-zinc-400 border-b-2 border-transparent transition-colors hover:text-zinc-200 data-[state=active]:text-white data-[state=active]:border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-t";

export function ProfileTabs({ profile }: ProfileTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = isTabKey(tabParam) ? tabParam : DEFAULT_TAB;

  const handleTabChange = (next: string) => {
    if (!isTabKey(next)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    // replace, not push: every tab click would otherwise pollute browser history.
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <Tabs.List
        className="flex border-b border-zinc-800 -mx-1 px-1 overflow-x-auto"
        aria-label="Profile sections"
      >
        {TAB_KEYS.map((key) => (
          <Tabs.Trigger key={key} value={key} className={triggerClass}>
            {TAB_LABELS[key]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <Tabs.Content value="personal" className="focus:outline-none">
        <PersonalForm initialData={profile} />
      </Tabs.Content>
      <Tabs.Content value="professional" className="focus:outline-none">
        <ProfessionalForm initialData={profile} />
      </Tabs.Content>
      <Tabs.Content value="education" className="focus:outline-none">
        <EducationForm initialData={profile} />
      </Tabs.Content>
      <Tabs.Content value="resume" className="focus:outline-none">
        <ResumeForm initialData={profile} />
      </Tabs.Content>
      <Tabs.Content value="preferences" className="focus:outline-none">
        <PreferencesForm initialData={profile} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
