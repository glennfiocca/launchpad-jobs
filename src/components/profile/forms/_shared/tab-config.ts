// Single source of truth for the profile tab keys, labels, and ordering.
// The list is exported as a const tuple so the union type can be derived
// from it (no risk of drift between runtime and types).

export const TAB_KEYS = [
  "personal",
  "professional",
  "education",
  "resume",
  "preferences",
] as const;

export type TabKey = (typeof TAB_KEYS)[number];

export const DEFAULT_TAB: TabKey = "personal";

export const TAB_LABELS: Record<TabKey, string> = {
  personal: "Personal",
  professional: "Professional",
  education: "Education",
  resume: "Resume",
  preferences: "Preferences",
};

export function isTabKey(value: string | null | undefined): value is TabKey {
  return !!value && (TAB_KEYS as readonly string[]).includes(value);
}
