// Single source of truth for the profile tab keys, labels, and ordering.
// The list is exported as a const tuple so the union type can be derived
// from it (no risk of drift between runtime and types).

import {
  Briefcase,
  FileText,
  FolderGit2,
  GraduationCap,
  History,
  type LucideIcon,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";

export const TAB_KEYS = [
  "personal",
  "professional",
  "work-history",
  "education",
  "skills-languages",
  "projects-certs",
  "resume",
  "preferences",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

export const DEFAULT_TAB: TabKey = "personal";

export const TAB_LABELS: Record<TabKey, string> = {
  personal: "Personal",
  professional: "Professional",
  "work-history": "Work History",
  education: "Education",
  "skills-languages": "Skills & Languages",
  "projects-certs": "Projects & Certs",
  resume: "Resume",
  preferences: "Preferences",
};

export const TAB_ICONS: Record<TabKey, LucideIcon> = {
  personal: User,
  professional: Briefcase,
  "work-history": History,
  education: GraduationCap,
  "skills-languages": Sparkles,
  "projects-certs": FolderGit2,
  resume: FileText,
  preferences: SlidersHorizontal,
};

export function isTabKey(value: string | null | undefined): value is TabKey {
  return !!value && (TAB_KEYS as readonly string[]).includes(value);
}

// Slugs accepted by the child-resource API + the `useChildResource` hook.
// Kept here so it sits next to the tab list (both are profile-UI-level concerns).
export const CHILD_RESOURCE_SLUGS = [
  "skills",
  "work-experience",
  "education-entries",
  "projects",
  "certifications",
  "languages",
] as const;

export type ChildResourceSlug = (typeof CHILD_RESOURCE_SLUGS)[number];
