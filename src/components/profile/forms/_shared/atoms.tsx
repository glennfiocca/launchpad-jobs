"use client";

/**
 * Form-level atoms shared across all 8 profile tabs.
 *
 * These are the building blocks the 6 parallel tab agents copy into their
 * tab rewrites. Keep additions to this file small, well-named, and
 * Direction A-faithful (lavender accents, mono eyebrows, Bricolage display).
 *
 * Where a primitive already exists in the cockpit (PulseDot), we import
 * from there rather than duplicate — see PATTERN.md.
 */

import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { PulseDot } from "@/components/dashboard/cockpit/atoms";

// ---------------------------------------------------------------------------
// FormEyebrow — mono uppercase caption above section titles.
// Default color is dim; pass `accent` for the lavender variant used over
// active / current-state sections.
// ---------------------------------------------------------------------------
interface FormEyebrowProps {
  children: ReactNode;
  accent?: boolean;
}

export function FormEyebrow({ children, accent = false }: FormEyebrowProps) {
  return (
    <span
      className={[
        "font-mono text-[10px] uppercase tracking-[0.08em]",
        accent ? "text-[var(--color-accent-lavender)]" : "text-text-dim",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader — eyebrow + title row used at the top of every form section.
// Direction A treatment: 14-px-radius card with hairline border (caller
// provides the card chrome via sectionClass), this just owns the title row.
// ---------------------------------------------------------------------------
interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: SectionHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h2 className="font-display text-text font-semibold text-[18px] leading-tight tracking-[-0.02em]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-[13px] text-text-muted leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// SavedPill — flashes for ~2s after a successful PUT. Used by the list-editor
// row header and by inline-edit fields. aria-live="polite" so a screen reader
// hears the save without being interrupted.
// ---------------------------------------------------------------------------
interface SavedPillProps {
  visible?: boolean;
}

export function SavedPill({ visible = true }: SavedPillProps) {
  const reduced = useReducedMotion();
  if (!visible) return null;
  return (
    <span
      aria-live="polite"
      className={[
        "pp-anim-saved-in",
        "inline-flex items-center gap-1.5",
        "font-mono text-[10.5px] tracking-[0.04em] text-[#67e8f9]",
      ].join(" ")}
      style={
        reduced
          ? undefined
          : { animation: "pp-saved-in 200ms ease-out" }
      }
    >
      <PulseDot />
      SAVED
    </span>
  );
}

// ---------------------------------------------------------------------------
// FieldDisplay — read-only display of a filled (or unfilled) field. Used by
// the page-header summaries and any tab that wants to show data outside the
// inline-edit affordance. Filled cells use a subtle hairline; empty cells
// use a dashed border so the absence reads as "drop in".
// ---------------------------------------------------------------------------
interface FieldDisplayProps {
  label: ReactNode;
  value?: ReactNode;
  mono?: boolean;
  hint?: ReactNode;
}

export function FieldDisplay({
  label,
  value,
  mono = false,
  hint = "Empty",
}: FieldDisplayProps) {
  const filled = value != null && value !== "";
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-text-muted font-medium mb-1.5">
        {label}
      </div>
      <div
        className={[
          "rounded-[12px] px-3.5 py-2.5 text-[14px] truncate",
          filled
            ? "bg-white/[0.025] border border-white/10 text-text"
            : "bg-transparent border border-dashed border-white/10 text-text-dim",
          mono ? "font-mono" : "",
        ].join(" ")}
      >
        {filled ? value : hint}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export the cockpit PulseDot so tabs don't need to know whether it
// lives here or in cockpit/. (Single import for everything the tab needs.)
// ---------------------------------------------------------------------------
export { PulseDot };
