"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { PersonalForm } from "./forms/personal-form";
import { ProfessionalForm } from "./forms/professional-form";
import { WorkHistoryForm } from "./forms/work-history-form";
import { EducationForm } from "./forms/education-form";
import { EducationHistoryForm } from "./forms/education-history-form";
import { SkillsLanguagesForm } from "./forms/skills-languages-form";
import { ProjectsCertsForm } from "./forms/projects-certs-form";
import { ResumeForm } from "./forms/resume-form";
import { PreferencesForm } from "./forms/preferences-form";
import {
  DEFAULT_TAB,
  isTabKey,
  TAB_ICONS,
  TAB_KEYS,
  TAB_LABELS,
  type TabKey,
} from "./forms/_shared/tab-config";

interface ProfileTabsProps {
  profile: UserProfile | null;
}

// Sidebar trigger (desktop): vertical pill row matching the settings sidenav
// pattern. Active state uses indigo accent to match the focus ring on inputs.
const sidebarTriggerClass = [
  "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium",
  "transition-colors text-left",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
  "text-zinc-400 hover:text-white hover:bg-white/5",
  "data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-300",
  "data-[state=active]:border data-[state=active]:border-indigo-500/30",
].join(" ");

// Mobile chip rail: same pattern as the settings sidenav mobile chip row.
const mobileTriggerClass = [
  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
  "border whitespace-nowrap transition-colors shrink-0",
  "text-zinc-400 border-white/10 hover:text-white hover:bg-white/5",
  "data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-300",
  "data-[state=active]:border-indigo-500/30",
].join(" ");

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
    <Tabs.Root
      value={activeTab}
      onValueChange={handleTabChange}
      orientation="vertical"
    >
      <div className="md:flex md:gap-8">
        {/* Mobile: horizontal pill rail */}
        <Tabs.List
          className="md:hidden flex gap-2 -mx-4 px-4 mb-4 overflow-x-auto pb-2 border-b border-white/5"
          aria-label="Profile sections"
        >
          {TAB_KEYS.map((key) => {
            const Icon = TAB_ICONS[key];
            return (
              <Tabs.Trigger key={key} value={key} className={mobileTriggerClass}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{TAB_LABELS[key]}</span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* Desktop: vertical sidebar */}
        <Tabs.List
          className="hidden md:flex md:flex-col w-56 shrink-0 gap-1 sticky top-4 self-start"
          aria-label="Profile sections"
        >
          {TAB_KEYS.map((key) => {
            const Icon = TAB_ICONS[key];
            return (
              <Tabs.Trigger key={key} value={key} className={sidebarTriggerClass}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate text-left">{TAB_LABELS[key]}</span>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-6">
          <Tabs.Content value="personal" className="focus:outline-none">
            <PersonalForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="professional" className="focus:outline-none">
            <ProfessionalForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="work-history" className="focus:outline-none">
            <WorkHistoryForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content
            value="education"
            className="focus:outline-none space-y-6"
          >
            {/* Legacy single-degree fields stay mounted above the multi-entry list
                editor so existing scalars on UserProfile keep round-tripping. */}
            <EducationForm initialData={profile} />
            <EducationHistoryForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="skills-languages" className="focus:outline-none">
            <SkillsLanguagesForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="projects-certs" className="focus:outline-none">
            <ProjectsCertsForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="resume" className="focus:outline-none">
            <ResumeForm initialData={profile} />
          </Tabs.Content>
          <Tabs.Content value="preferences" className="focus:outline-none">
            <PreferencesForm initialData={profile} />
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>
  );
}
