"use client";

/**
 * star-glyph.tsx — Reusable star/rating primitives shared across profile tabs.
 *
 * Exports:
 *   StarGlyph            — pure-SVG filled/empty star glyph (no icon library).
 *   TierStars            — row of 5 stars indicating a proficiency tier.
 *   ProficiencyStarPicker — segmented 1-5 star picker (button per tier).
 *
 * All lavender accent colors come from @theme tokens — no hex literals.
 */

// ─────────────────────────────────────────────────────────────────────────────
// StarGlyph — pure-SVG star, keeps the dark theme cohesive.
// Filled stars use lavender at full opacity; empty stars use the same
// lavender at 18% opacity — single accent color per @theme contract.
// ─────────────────────────────────────────────────────────────────────────────

interface StarGlyphProps {
  filled: boolean;
  size?: number;
}

export function StarGlyph({ filled, size = 10 }: StarGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        color: "var(--color-accent-lavender)",
        opacity: filled ? 1 : 0.18,
      }}
    >
      <path
        d="M8 1.5l1.92 4.36 4.74.49-3.55 3.18 1.01 4.66L8 11.86l-4.12 2.33 1.01-4.66L1.34 6.35l4.74-.49L8 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TierStars — compact 5-star row for tier gutter and collapsed chip pill.
// ─────────────────────────────────────────────────────────────────────────────

type ProficiencyTier = 1 | 2 | 3 | 4 | 5;

interface TierStarsProps {
  stars: ProficiencyTier;
}

export function TierStars({ stars }: TierStarsProps) {
  return (
    <div
      className="inline-flex gap-[2px]"
      aria-label={`Tier ${stars} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <StarGlyph key={i} filled={i <= stars} size={11} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProficiencyStarPicker — 1-5 segmented star picker in Direction A pill style.
// Active stars filled in lavender. Re-used by SkillChipEditor and any future
// rating surface in the profile.
// ─────────────────────────────────────────────────────────────────────────────

interface ProficiencyStarPickerProps {
  value: ProficiencyTier;
  onChange: (v: ProficiencyTier) => void;
}

export function ProficiencyStarPicker({
  value,
  onChange,
}: ProficiencyStarPickerProps) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Proficiency tier">
      {([1, 2, 3, 4, 5] as const).map((v) => {
        const active = v <= value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={`Tier ${v} of 5`}
            aria-pressed={v === value}
            className={`w-8 h-8 rounded-[8px] border transition-colors flex items-center justify-center ${
              active
                ? "bg-[rgba(196,181,253,0.12)] border-[rgba(196,181,253,0.40)]"
                : "bg-white/5 border-white/10 hover:border-white/20"
            }`}
          >
            <StarGlyph filled={active} size={12} />
          </button>
        );
      })}
    </div>
  );
}
