// Shared Tailwind class strings for profile sub-forms.
// Centralized so all eight tabs render identically without copy-paste drift.
//
// PR1 redesign adds Direction A classes below the legacy block. Legacy
// exports (inputClass, sectionClass, etc.) are PRESERVED so the parallel
// tab agents can adopt the new tokens incrementally without breakage.

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Legacy classes — kept verbatim. Tab agents migrate to the Direction A
// variants below as they're rewritten; nothing breaks if a tab still uses
// the legacy names while another has already migrated.
// ---------------------------------------------------------------------------

/** @deprecated Use `directionAInputClass` for Direction A surfaces. */
export const inputClass =
  "bg-black border border-white/10 text-text rounded-xl px-4 py-2.5 w-full text-sm placeholder:text-zinc-700 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";

export const labelClass = "block text-sm text-text-muted font-medium mb-1";

/** @deprecated Use `directionASectionClass` for Direction A surfaces. */
export const sectionClass =
  "bg-[#0a0a0a] border border-white/[0.08] rounded-2xl p-6 space-y-4";

export const sectionTitleClass =
  "text-text font-semibold text-sm uppercase tracking-wide mb-4";

/** @deprecated Use `primaryWhiteBtnClass` for Direction A surfaces. */
export const submitButtonClass =
  "bg-white text-black font-semibold rounded-xl px-6 py-3 hover:bg-zinc-100 transition-colors disabled:opacity-50 text-sm";

export const gridTwoCol = "grid grid-cols-1 md:grid-cols-2 gap-4";
export const gridThreeCol =
  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
export const formStackClass = "space-y-6";
export const subsectionLabelClass =
  "text-xs uppercase tracking-wide text-text-dim";
export const pageHeaderTitleClass = "text-2xl font-semibold text-text";
export const pageHeaderSubtitleClass = "text-text-muted mt-1 text-sm";

// ---------------------------------------------------------------------------
// Direction A classes — the migration targets. Tab agents start here.
// ---------------------------------------------------------------------------

// Section card with a 14px corner radius and the editorial hairline border.
// Direction A's section frame; replace `sectionClass` over time.
export const directionASectionClass =
  "rounded-[14px] border border-white/[0.06] bg-white/[0.015] p-6 space-y-4";

// Section divider above the title row (for sections that sit inside the same
// card and want a faint rule between groups).
export const sectionDividerClass = "border-t border-white/[0.06] pt-4 mt-4";

// Lavender accent treatment — applied to either an eyebrow or a small icon
// chip to signal "this group is active / current / required."
export const lavenderAccentClass = "text-[var(--color-accent-lavender)]";

// Direction A input — black bg, 12px radius, lavender focus ring (matches
// the prototype's `PPInput`). Use this in new fields; the legacy `inputClass`
// is preserved so list-editor rows that haven't been migrated yet still render.
export const directionAInputClass = cn(
  "w-full rounded-[12px] bg-black text-text",
  "border border-white/10 px-3.5 py-2.5 text-[14px]",
  "placeholder:text-text-dim transition-all duration-150",
  "focus:outline-none focus:border-[rgba(196,181,253,0.50)]",
  "focus:shadow-[0_0_0_4px_rgba(196,181,253,0.10)]",
);

// Eyebrow above a Direction A section title (mono · uppercase · dim).
export const eyebrowClass =
  "font-mono text-[10px] tracking-[0.08em] uppercase text-text-dim";

// Lavender variant of the eyebrow — for "next best action," "current role,"
// "in progress" callouts.
export const eyebrowAccentClass =
  "font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent-lavender)]";

// Tab-level section header row (eyebrow + title side-by-side with a hairline
// divider beneath). Used at the top of every form section.
export const sectionHeaderRowClass =
  "flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-3 mb-4";

// Pill toggle (Remote/Hybrid/Onsite, Search Status, Compliance tri-state).
// Lavender-tinted active state; faint dark for inactive. Centralized so the
// tab agents don't reinvent this twice.
export function pillBtnClass(active: boolean): string {
  return cn(
    "rounded-[10px] px-3 py-2 text-sm border transition-colors",
    active
      ? "bg-[rgba(196,181,253,0.12)] text-[var(--color-accent-lavender)] border-[rgba(196,181,253,0.32)] font-semibold"
      : "bg-white/5 text-text-muted border-white/10 hover:border-white/20 font-medium",
  );
}

// Primary white-gradient button (matches JobDetail "One-click apply" + the
// Direction A resume card's "View PDF"). For non-list-form submits that
// haven't been migrated to blur-to-save yet (e.g. Personal tab).
export const primaryWhiteBtnClass = cn(
  "inline-flex items-center justify-center gap-2 py-3 px-6 rounded-[12px]",
  "font-display font-semibold text-[14px] transition-transform active:scale-[0.985]",
  "text-bg bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0]",
  "shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
);

// Ghost button — same shape as the primary, transparent fill. Pair with
// primaryWhiteBtnClass in two-button rows ([Save][Cancel]).
export const ghostBtnClass = cn(
  "inline-flex items-center justify-center gap-2 py-[7px] px-3.5 rounded-[10px]",
  "font-display font-medium text-[12.5px] transition-colors",
  "bg-white/5 text-text-muted border border-white/10",
  "hover:text-text hover:border-white/20",
);

// Subtle "Add row" CTA — dashed lavender border on a faint lavender fill.
// Used at the bottom of every list-editor tab (work history, skills,
// languages, projects, certifications, education).
export const addRowBtnClass = cn(
  "w-full rounded-[14px] border border-dashed border-[rgba(196,181,253,0.30)]",
  "bg-[rgba(196,181,253,0.04)] text-[var(--color-accent-lavender)]",
  "py-3 px-4 font-display font-medium text-[13.5px]",
  "flex items-center justify-center gap-2 transition-colors",
  "hover:bg-[rgba(196,181,253,0.07)] hover:border-[rgba(196,181,253,0.45)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);
