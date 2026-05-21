"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { PersonalForm } from "./forms/personal-form";
import { ProfessionalForm } from "./forms/professional-form";
import { WorkHistoryForm } from "./forms/work-history-form";
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
import type { PerSectionScore } from "@/lib/profile/completeness";

interface ProfileTabsProps {
  profile: UserProfile | null;
  /** Per-section completion 0..100. Drives the status dot on each tab. */
  perSection: PerSectionScore;
}

// Status-dot color rules (locked spec):
//   pct === 100 → cyan (with soft glow)
//   0 < pct < 100 → lavender
//   pct === 0 → faint dim
// Returned as inline style objects so the colors reference @theme tokens
// without a CSS-in-JS layer (legitimate use of inline style per project
// coding-style for dynamic theme-token values).
function dotStyle(pct: number): {
  background: string;
  boxShadow: string;
} {
  if (pct === 100) {
    return {
      background: "var(--color-accent-cyan)",
      boxShadow: "0 0 6px var(--color-accent-cyan)",
    };
  }
  if (pct > 0) {
    return {
      background: "var(--color-accent-lavender)",
      boxShadow: "none",
    };
  }
  return {
    background: "rgba(245,244,241,0.18)",
    boxShadow: "none",
  };
}

// Sidebar trigger (desktop): vertical pill matching Direction A sidenav
// treatment. Active state uses indigo-lavender tint (Direction A spec).
const sidebarTriggerClass = [
  "flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-sm font-medium",
  "transition-colors text-left",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
  "text-text-muted hover:text-text hover:bg-white/5 border border-transparent",
  "data-[state=active]:bg-[rgba(99,102,241,0.10)]",
  "data-[state=active]:text-[var(--color-accent-lavender)]",
  "data-[state=active]:border-[rgba(99,102,241,0.28)]",
].join(" ");

// Mobile chip rail: same as before structurally, now with a status dot
// inside each chip per spec Q9.
const mobileTriggerClass = [
  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
  "border whitespace-nowrap transition-colors shrink-0",
  "text-text-muted border-white/10 hover:text-text hover:bg-white/5",
  "data-[state=active]:bg-[rgba(99,102,241,0.10)] data-[state=active]:text-[var(--color-accent-lavender)]",
  "data-[state=active]:border-[rgba(99,102,241,0.28)]",
].join(" ");

export function ProfileTabs({ profile, perSection }: ProfileTabsProps) {
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

  // Sidebar header — name in Bricolage above the tab list. Falls back to
  // "Your profile" before identity is filled.
  const sidebarHeading = profile?.firstName
    ? `${profile.firstName}${profile.lastName ? ` ${profile.lastName}` : ""}`
    : "Your profile";

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
            const ds = dotStyle(perSection[key]);
            return (
              <Tabs.Trigger key={key} value={key} className={mobileTriggerClass}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{TAB_LABELS[key]}</span>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={ds}
                />
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* Desktop: vertical sidebar — sticky beneath navbar */}
        <aside className="hidden md:flex md:flex-col w-56 shrink-0 sticky self-start top-[calc(var(--navbar-h)+16px)]">
          <div className="mb-3 px-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-dim">
              Sections
            </div>
            <div className="mt-1 font-display font-medium text-[15px] tracking-[-0.015em] text-text truncate">
              {sidebarHeading}
            </div>
          </div>
          <Tabs.List
            className="flex flex-col gap-1"
            aria-label="Profile sections"
          >
            {TAB_KEYS.map((key) => {
              const Icon = TAB_ICONS[key];
              const ds = dotStyle(perSection[key]);
              return (
                <Tabs.Trigger
                  key={key}
                  value={key}
                  className={sidebarTriggerClass}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate text-left">
                    {TAB_LABELS[key]}
                  </span>
                  <span
                    aria-hidden
                    className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                    style={ds}
                  />
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
        </aside>

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
          <Tabs.Content value="education" className="focus:outline-none">
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
