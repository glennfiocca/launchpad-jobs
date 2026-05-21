"use client";

/**
 * StickyMiniHeader — slim compressed header strip that pins below the navbar
 * once the user scrolls past the hero.
 *
 * Cherry-picked from prototype direction-c.jsx (CompactDirCHeader) but tuned
 * to Direction A's color / type identity rather than C's "cockpit" look:
 *  - dark elevated bg with backdrop blur + faint hairline border
 *  - mini sigil (~36px, no tooltips, no center label, no perimeter labels)
 *  - name with lavender emphasis on "profile,"
 *  - tabular-nums completion %
 *  - compact next-best-action chip on the right
 *
 * Visibility is driven by an IntersectionObserver on a sentinel element
 * (rendered at the bottom of the hero by the parent). When the sentinel
 * scrolls out of view, the strip slides in. When it returns to view, the
 * strip slides out. AnimatePresence + useReducedMotion() gate the motion:
 * under reduced motion, the strip fades only (no slide).
 *
 * Hidden on <md — mobile has its own simplified header and doesn't need a
 * second sticky chrome layer.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { PerSectionScore } from "@/lib/profile/completeness";
import { Sigil } from "../sigil/sigil";
import { NextBestActionChip } from "./next-best-action-chip";

interface StickyMiniHeaderProps {
  /** Sentinel element marking the bottom of the hero. When it leaves the
   *  viewport, the mini strip shows; when it returns, the strip hides. */
  sentinelRef: RefObject<HTMLElement | null>;
  firstName: string | null;
  perSection: PerSectionScore;
  totalPct: number;
  updatedAgo: string;
  isStale: boolean;
}

export function StickyMiniHeader({
  sentinelRef,
  firstName,
  perSection,
  totalPct,
  updatedAgo,
  isStale,
}: StickyMiniHeaderProps) {
  const reduced = useReducedMotion();
  const [show, setShow] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (typeof IntersectionObserver === "undefined") return;

    // The sentinel is the last 1px of the hero. When it scrolls out of view
    // (intersectionRatio === 0 AND y < 0 — i.e. above the viewport), show
    // the strip. When it scrolls back in, hide.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const passedHero =
            !entry.isIntersecting &&
            entry.boundingClientRect.top < 0;
          setShow(passedHero);
        }
      },
      // No rootMargin tweak — we want the strip to appear exactly when the
      // hero scrolls past the top of the viewport.
      { threshold: 0 },
    );
    observer.observe(sentinel);
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [sentinelRef]);

  const greeting = firstName ?? "Your";
  const initialY = reduced ? 0 : -8;
  const exitY = reduced ? 0 : -8;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          // Fixed (not sticky) so the strip detaches from the document flow
          // and sits beneath the navbar regardless of scroll container quirks.
          // Hidden on <md per spec — mobile keeps the v1 fallback only.
          className="hidden md:flex fixed left-0 right-0 z-30 items-center gap-4 border-b border-white/[0.08] bg-[var(--color-bg-elev)]/85 backdrop-blur-xl px-6 lg:px-8"
          style={{
            top: "var(--navbar-h)",
            // Visual budget: 64-72px max per spec.
            minHeight: 64,
            maxHeight: 72,
          }}
          initial={{ opacity: 0, y: initialY }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: exitY }}
          transition={{
            duration: reduced ? 0.12 : 0.22,
            ease: "easeOut",
          }}
          aria-label="Profile summary"
          role="region"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4">
            {/* Mini sigil — glyph only, no tooltips, no center %. */}
            <div className="shrink-0">
              <Sigil
                perSection={perSection}
                totalPct={totalPct}
                size={36}
                hideLabels
                showInteractions={false}
                showCenter={false}
              />
            </div>

            {/* Name + completion %. The H2 mirrors the hero's lavender accent
                so the strip reads as the same artefact, compressed. */}
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="font-display font-medium text-text text-[16px] leading-tight tracking-[-0.025em] truncate">
                {firstName ? `${greeting}'s ` : `${greeting} `}
                <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
                  profile
                </em>
              </h2>
              <span className="font-mono text-[11px] text-text-dim tabular-nums whitespace-nowrap">
                {totalPct}% complete
              </span>
            </div>

            {/* Right side — compact next-best-action pill. */}
            <div className="ml-auto shrink-0">
              <NextBestActionChip
                perSection={perSection}
                totalPct={totalPct}
                updatedAgo={updatedAgo}
                isStale={isStale}
                compact
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
