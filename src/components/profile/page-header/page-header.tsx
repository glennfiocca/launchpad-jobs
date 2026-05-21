"use client";

/**
 * ProfilePageHeader — top of /profile.
 *
 * Direction A two-column hero (sigil on the right) at >= md, MobileHeader
 * fallback (no sigil, 2x2 metric grid, thin progress bar) at < md.
 *
 * At >= md, a <StickyMiniHeader> is also mounted. It manages its own
 * visibility via an IntersectionObserver pinned to a 1px sentinel at the
 * bottom of the hero — when the hero scrolls past the top of the viewport
 * the strip slides in, when it returns the strip slides out. Mobile keeps
 * the v1 fallback only (no sticky chrome).
 */

import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import type { PerSectionScore } from "@/lib/profile/completeness";
import { Sigil } from "../sigil/sigil";
import { PulseDot } from "@/components/dashboard/cockpit/atoms";
import { MetricStrip } from "./metric-strip";
import { NextBestActionChip } from "./next-best-action-chip";
import { MobileHeader } from "./mobile-header";
import { StickyMiniHeader } from "./sticky-mini-header";
import type { TooltipPartialContext } from "../sigil/sigil-tooltip-copy";
import type { TabKey } from "../forms/_shared/tab-config";

interface ProfilePageHeaderProps {
  /** Used in the H1 ("Jordan's profile, drawn from you."). */
  firstName: string | null;
  perSection: PerSectionScore;
  totalPct: number;
  /** Pre-formatted "today" / "12d" / "5mo" — server-derived. */
  updatedAgo: string;
  /** Whether the profile crossed the staleness threshold. */
  isStale: boolean;
  /** Optional partial context for the per-vertex tooltips on personal /
   *  professional (so the body can say "4 of 6 filled in"). */
  partialContext?: Partial<Record<TabKey, TooltipPartialContext>>;
}

// Derive per-state cell counts from a per-section score object. Kept inline
// so the page header is a single visual unit with no extra prop drilling.
function countByState(perSection: PerSectionScore): {
  filled: number;
  partial: number;
  empty: number;
} {
  let filled = 0;
  let partial = 0;
  let empty = 0;
  for (const value of Object.values(perSection)) {
    if (value === 100) filled += 1;
    else if (value === 0) empty += 1;
    else partial += 1;
  }
  return { filled, partial, empty };
}

export function ProfilePageHeader({
  firstName,
  perSection,
  totalPct,
  updatedAgo,
  isStale,
  partialContext,
}: ProfilePageHeaderProps) {
  const reduced = useReducedMotion();
  const { filled, partial, empty } = countByState(perSection);
  const greeting = firstName ?? "Your";
  // Sentinel sits at the bottom of the desktop hero; the sticky-mini header
  // observes it to know when to show / hide.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      {/* Mobile (<md) — sigil-less stacked layout */}
      <MobileHeader
        firstName={firstName}
        perSection={perSection}
        totalPct={totalPct}
        filledCount={filled}
        partialCount={partial}
        emptyCount={empty}
        updatedAgo={updatedAgo}
        isStale={isStale}
      />

      {/* Desktop (>= md) — sticky compressed strip. Hidden on <md inside the
          component itself; mobile keeps the v1 fallback header only. */}
      <StickyMiniHeader
        sentinelRef={sentinelRef}
        firstName={firstName}
        perSection={perSection}
        totalPct={totalPct}
        updatedAgo={updatedAgo}
        isStale={isStale}
      />

      {/* Desktop (>= md) — full Direction A two-column hero */}
      <header className="hidden md:flex md:flex-col md:gap-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/12 font-mono text-[11px] tracking-[0.04em] text-text-muted">
            <PulseDot />
            Profile · <span className="tabular-nums">{totalPct}%</span>{" "}
            complete · auto-saving
          </span>
          <span className="font-mono text-[11px] text-text-dim">
            Updated{" "}
            <span className="tabular-nums">{updatedAgo}</span> ago · drafts
            kept for 30 days
          </span>
        </div>

        <div className="grid grid-cols-[1.05fr_0.95fr] gap-8 items-center">
          <div className="flex flex-col gap-[18px] min-w-0">
            <h1
              className="font-display font-medium text-text leading-[0.95] tracking-[-0.045em] text-[clamp(40px,5vw,64px)]"
              style={
                reduced
                  ? undefined
                  : { animation: "pp-fade-up 480ms ease-out" }
              }
            >
              {firstName ? `${greeting}'s ` : `${greeting} `}
              <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
                profile,
              </em>
              <br />
              drawn from{" "}
              <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
                you.
              </em>
            </h1>

            <p className="text-[14.5px] text-text-muted max-w-[480px] leading-[1.55] text-pretty">
              Each spoke is one section. The shape on the right is yours —
              it grows toward the dashed envelope as you fill things in.
              The notches show what&apos;s still open.
            </p>

            <MetricStrip
              filledCount={filled}
              partialCount={partial}
              emptyCount={empty}
              updatedAgo={updatedAgo}
              totalAxes={Object.keys(perSection).length}
            />
          </div>

          <div className="flex items-center justify-center p-2 min-w-0">
            <Sigil
              perSection={perSection}
              totalPct={totalPct}
              partialContext={partialContext}
              size={380}
            />
          </div>
        </div>

        <NextBestActionChip
          perSection={perSection}
          totalPct={totalPct}
          updatedAgo={updatedAgo}
          isStale={isStale}
        />

        {/* Sentinel — 1px sliver at the bottom of the hero. The sticky-mini
            header observes this via IntersectionObserver to decide when to
            show / hide. aria-hidden because it carries no semantic content. */}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      </header>
    </>
  );
}
