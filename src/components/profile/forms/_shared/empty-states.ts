import type { LucideIcon } from "lucide-react";
import {
  Award,
  FolderGit2,
  GraduationCap,
  History,
  Languages,
  Sparkles,
} from "lucide-react";

// Per-list empty-state copy keyed by the same slug used by the child-resource
// API. Keeps copy out of components so it can be tweaked centrally without
// touching list-editor wiring.
export interface EmptyStateContent {
  icon: LucideIcon;
  heading: string;
  body: string;
}

export const EMPTY_STATES: Record<string, EmptyStateContent> = {
  "work-experience": {
    icon: History,
    heading: "No work experience yet",
    body: "Add your most recent role first — you can reorder later.",
  },
  "education-entries": {
    icon: GraduationCap,
    heading: "No additional education yet",
    body: "Add bootcamps, second degrees, or other coursework.",
  },
  skills: {
    icon: Sparkles,
    heading: "No skills yet",
    body: "List your strongest skills — autofill uses these to answer ATS questions.",
  },
  languages: {
    icon: Languages,
    heading: "No languages yet",
    body: "Add languages you speak and your proficiency level.",
  },
  projects: {
    icon: FolderGit2,
    heading: "No projects yet",
    body: "Showcase a few side projects, open source contributions, or work samples.",
  },
  certifications: {
    icon: Award,
    heading: "No certifications yet",
    body: "Add credentials, licenses, and professional certifications.",
  },
};
