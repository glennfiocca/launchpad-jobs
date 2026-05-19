"use client";

/**
 * AutofillSummary — collapsible "fields auto-filled" card for the
 * apply pane. Per the locked spec:
 *
 *   Collapsed: single line "Sparkles · {N} fields auto-filled
 *              · Resume · LinkedIn · GitHub · location · work auth
 *              · degree · {N} more" + chevron.
 *
 *   Expanded:  2-column grid of canonical profile-field rows. The
 *              list is fixed (8 rows) regardless of whether each
 *              field is actually needed for this specific job's
 *              questions. The point is to surface "we already know
 *              this about you" — not to mirror the questions.
 *
 * The `filledCount` count comes from the question-matcher
 * (`questions.length - unanswered.length`) and is rendered in a
 * lavender mono pill so the number reads as the loudest atom on
 * the card.
 */

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { UserProfile } from "@prisma/client";
import { cn } from "@/lib/utils";

interface AutofillSummaryProps {
  filledCount: number;
  profile: UserProfile;
}

const EM_DASH = "—";

interface FieldRow {
  label: string;
  value: string;
  /** True when the user actually has this field populated. Drives the
   *  dim/normal color on the value cell. */
  present: boolean;
}

function buildRows(profile: UserProfile): readonly FieldRow[] {
  const row = (label: string, raw: string | null | undefined): FieldRow => ({
    label,
    value: raw && raw.trim().length > 0 ? raw : EM_DASH,
    present: !!(raw && raw.trim().length > 0),
  });

  const locationText =
    profile.locationFormatted ??
    (profile.locationCity && profile.locationState
      ? `${profile.locationCity}, ${profile.locationState}`
      : profile.location);

  const workAuthLabel = (() => {
    switch (profile.workAuthorization) {
      case "US_CITIZEN":
        return "U.S. Citizen";
      case "GREEN_CARD":
        return "Green Card";
      case "VISA":
        return "Visa";
      case "OTHER":
        return "Other";
      default:
        return profile.requiresSponsorship ? "Requires sponsorship" : null;
    }
  })();

  const degreeText = (() => {
    const d = profile.highestDegree;
    const f = profile.fieldOfStudy;
    if (d && f) return `${d}, ${f}`;
    return d ?? f ?? null;
  })();

  const yearsExperience =
    typeof profile.yearsExperience === "number"
      ? `${profile.yearsExperience}`
      : null;

  return [
    row("Resume", profile.resumeFileName ?? null),
    row("LinkedIn", profile.linkedinUrl),
    row("GitHub", profile.githubUrl),
    row("Phone", profile.phone),
    row("Location", locationText ?? null),
    row("Work auth", workAuthLabel),
    row("Degree", degreeText),
    row("Years exp.", yearsExperience),
  ];
}

export function AutofillSummary({
  filledCount,
  profile,
}: AutofillSummaryProps) {
  const [open, setOpen] = useState(false);
  const rows = buildRows(profile);

  // Headline previews — fixed list per spec, calls out the strongest
  // signals. The "{N} more" count is total profile fields minus the
  // 6 we explicitly list (Resume, LinkedIn, GitHub, location, work
  // auth, degree) — only render when positive.
  const namedInPreview = 6;
  const more = Math.max(0, filledCount - namedInPreview);

  return (
    <div className="rounded-[12px] border border-[rgba(99,102,241,0.22)] bg-[rgba(99,102,241,0.06)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-3 px-3.5 py-3 text-left",
          "transition-colors hover:bg-[rgba(99,102,241,0.10)]",
        )}
      >
        <div
          className={cn(
            "w-7 h-7 rounded-full bg-[rgba(99,102,241,0.20)] text-accent-light",
            "flex items-center justify-center shrink-0",
          )}
        >
          <Sparkles className="w-[14px] h-[14px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-text font-medium leading-tight">
            <span className="font-mono text-[12px] text-accent-lavender">
              {filledCount}
            </span>
            <span className="ml-1.5">fields auto-filled from your profile</span>
          </p>
          <p className="text-[11.5px] text-text-muted mt-0.5 truncate">
            Resume · LinkedIn · GitHub · location · work auth · degree
            {more > 0 ? ` · ${more} more` : ""}
          </p>
        </div>
        <span className="text-[12px] font-medium text-accent-lavender shrink-0">
          {open ? "Hide" : "Review"}
        </span>
        <ChevronDown
          className={cn(
            "w-[13px] h-[13px] text-text-dim transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "border-t border-[rgba(99,102,241,0.16)] bg-[rgba(99,102,241,0.03)]",
            "px-3.5 py-3 grid grid-cols-2 gap-x-3.5 gap-y-1.5",
          )}
        >
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline gap-2 text-[11.5px] min-w-0"
            >
              <span className="text-text-dim shrink-0 min-w-[72px]">
                {r.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] truncate",
                  r.present ? "text-text" : "text-text-dim",
                )}
                title={r.value}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
