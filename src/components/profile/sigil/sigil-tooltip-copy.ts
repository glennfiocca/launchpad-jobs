import type { TabKey } from "@/components/profile/forms/_shared/tab-config";

/**
 * Per-tab × per-state tooltip copy for the profile sigil.
 *
 * Three states for proportional axes (personal, professional):
 *   - empty   (pct === 0)
 *   - partial (0 < pct < 100)
 *   - full    (pct === 100)
 *
 * Two states for the six binary axes (work-history, education,
 * skills-languages, projects-certs, resume, preferences):
 *   - empty (0)
 *   - full  (100)  — copy explicitly notes that 100% reflects "you added
 *                    at least one. Adding more helps your job recommendations."
 *
 * `partialContext` supplies {filled, total} for the proportional axes so the
 * tooltip body can read "4 of 6 contributors filled in."
 */

export interface TooltipCopy {
  readonly title: string;
  readonly body: string;
}

export interface TooltipPartialContext {
  readonly filled: number;
  readonly total: number;
}

// Section titles used in tooltip headlines. The full label set lives in
// TAB_LABELS (tab-config), but the sigil uses a slightly more conversational
// phrasing so it doesn't sound like a settings page.
const SECTION_TITLES: Record<TabKey, string> = {
  personal: "Personal",
  professional: "Professional",
  "work-history": "Work history",
  education: "Education",
  "skills-languages": "Skills & languages",
  "projects-certs": "Projects & certifications",
  resume: "Resume",
  preferences: "Preferences",
};

// Phrase fragment for "what counts as one more entry" — used in binary-axis
// "full" copy so the user knows why adding more matters.
const BINARY_ADD_MORE: Partial<Record<TabKey, string>> = {
  "work-history": "more roles",
  education: "more schools or programs",
  "skills-languages": "more skills or languages",
  "projects-certs": "more projects or certifications",
  preferences: "more preferences",
};

// Pretty-print N → "your first" / "your second" / "your Nth" — small flourish
// so the partial copy doesn't read like spreadsheet output.
function ordinal(n: number): string {
  const map: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
  };
  return map[n] ?? `${n}th`;
}

function getProportionalCopy(
  tab: "personal" | "professional",
  pct: number,
  partial: TooltipPartialContext | undefined,
): TooltipCopy {
  const title = SECTION_TITLES[tab];

  if (pct === 0) {
    return {
      title,
      body:
        tab === "personal"
          ? "Your name, email, phone, location, and at least one top social link. The basics that go on every application."
          : "Your headline, summary, current title, top social link, and a cover-letter intro template. The professional snapshot we use to autofill.",
    };
  }

  if (pct === 100) {
    return {
      title,
      body:
        tab === "personal"
          ? "All six basics are in. This is the foundation Pipeline uses to fill out every job application on your behalf."
          : "All five fields are in. This is the professional snapshot we paste into every cover letter and application form.",
    };
  }

  // Partial — surface fraction + suggest the next step generically.
  const ctx = partial ?? { filled: 0, total: tab === "personal" ? 6 : 5 };
  const remaining = Math.max(0, ctx.total - ctx.filled);
  return {
    title,
    body: `${ctx.filled} of ${ctx.total} filled in. Adding your ${ordinal(ctx.filled + 1)} pushes this spoke ${remaining === 1 ? "to full." : "outward."}`,
  };
}

function getBinaryCopy(
  tab: Exclude<TabKey, "personal" | "professional">,
  pct: number,
): TooltipCopy {
  const title = SECTION_TITLES[tab];

  if (pct === 0) {
    const emptyBody: Record<typeof tab, string> = {
      "work-history":
        "No roles yet. Add your most recent first — Pipeline timelines them on the spine in the work-history tab.",
      education:
        "No schools yet. Add the most recent program — universities, bootcamps, and independent study all count.",
      "skills-languages":
        "No skills or spoken languages yet. Add what you'd put on a resume; we match these against job requirements.",
      "projects-certs":
        "No projects or certifications yet. Side projects, open-source work, and credentials all live here.",
      resume:
        "No resume uploaded. Pipeline stores one canonical PDF and re-uses it everywhere you apply.",
      preferences:
        "No preferences set. Target roles, employment type, and salary expectations — we filter every job through these.",
    };
    return { title, body: emptyBody[tab] };
  }

  // Full state — be explicit that 100% only means "at least one is in,"
  // and that adding more meaningfully improves matching.
  const addMore = BINARY_ADD_MORE[tab];
  const fullBody: Record<typeof tab, string> = {
    "work-history": `You're at 100% because you added at least one role. Adding ${addMore} improves your job recommendations.`,
    education: `You're at 100% because you added at least one entry. Adding ${addMore} improves your job recommendations.`,
    "skills-languages": `You're at 100% because you added at least one. Adding ${addMore} improves your job recommendations.`,
    "projects-certs": `You're at 100% because you added at least one. Adding ${addMore} improves your job recommendations.`,
    resume: `Your resume is in. Pipeline uses this file at apply-time — replace it any time the canonical version changes.`,
    preferences: `You're at 100% because at least one preference is set. Setting ${addMore} sharpens job-match quality.`,
  };
  return { title, body: fullBody[tab] };
}

export function getTooltipCopy(
  tab: TabKey,
  pct: number,
  partialContext?: TooltipPartialContext,
): TooltipCopy {
  if (tab === "personal" || tab === "professional") {
    return getProportionalCopy(tab, pct, partialContext);
  }
  return getBinaryCopy(tab, pct);
}
