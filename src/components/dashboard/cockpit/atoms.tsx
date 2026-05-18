"use client";

/**
 * Cockpit atoms — shared primitives composed by the editorial dashboard.
 *
 * Translated from the design prototype's inline-styled atoms (see
 * /tmp/pipeline-dashboard-handoff/design_handoff_dashboard_editorial_cockpit/
 *  prototype/common.jsx and direction-a.jsx) to Tailwind v4 with the existing
 * `@theme` tokens in globals.css. Where the prototype uses one-off pixel
 * values that don't map to a token (e.g. 22px, 11px), arbitrary-value
 * utilities are used with a comment pointing to the prototype line.
 */

import type { ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

// ---------------------------------------------------------------------------
// Button class strings — exported as constants so consumers can pass them to
// any element (button, link, motion.button) without wrapping in a component.
// Matches prototype's btnPrimary / btnGhost in common.jsx.
// ---------------------------------------------------------------------------

// from prototype/common.jsx :38-43 (btnPrimary)
export const BTN_PRIMARY =
  "inline-flex items-center justify-center px-3 py-[6px] rounded-lg bg-accent text-white font-display text-[12px] font-medium border border-white/5 cursor-pointer transition-colors hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed";

// from prototype/common.jsx :44-49 (btnGhost)
export const BTN_GHOST =
  "inline-flex items-center justify-center px-3 py-[6px] rounded-lg bg-transparent border border-white/12 text-text-muted font-display text-[12px] font-medium cursor-pointer transition-colors hover:text-text hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed";

// ---------------------------------------------------------------------------
// Metric — Bricolage value over a mono uppercase label. Right-aligned per
// prototype direction-a.jsx :288-298.
// ---------------------------------------------------------------------------

interface MetricProps {
  label: string;
  value: string;
  delta?: string;
}

export function Metric({ label, value, delta }: MetricProps) {
  return (
    <div className="text-right">
      {/* from prototype direction-a.jsx :291 */}
      <div className="text-[10px] tracking-[0.06em] uppercase text-text-dim">
        {label}
      </div>
      <div className="mt-[3px] flex items-baseline gap-[6px] justify-end">
        {/* from prototype direction-a.jsx :293 — 22px Bricolage value */}
        <span className="font-display font-medium text-[22px] text-text tracking-[-0.02em] tabular-nums">
          {value}
        </span>
        {delta && (
          <span className="text-[10px] text-accent-cyan tabular-nums">
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kbd — small keyboard hint chip. Used in section-header decoration.
// from prototype/common.jsx :50-55 (kbdStyle).
// ---------------------------------------------------------------------------

interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-white/[0.06] border border-white/10 rounded-[3px] font-mono text-[10px] text-text-muted">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// PulseDot — eyebrow's animated cyan dot with a soft ping ripple. Renders a
// static dot when the user prefers reduced motion (the ripple is skipped).
// ---------------------------------------------------------------------------

export function PulseDot() {
  const reduced = useReducedMotion();
  return (
    <span className="relative inline-flex w-[6px] h-[6px] rounded-full bg-accent-cyan shadow-[0_0_8px_var(--color-accent-cyan)]">
      {!reduced && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-accent-cyan opacity-60"
          // Inline keyframes avoid touching globals.css for this single use.
          // The 1.6s ease-out matches prototype direction-a.jsx :281-282.
          style={{ animation: "cockpit-ping 1.6s ease-out infinite" }}
        />
      )}
      <style>{`
        @keyframes cockpit-ping {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </span>
  );
}

// ---------------------------------------------------------------------------
// SeparatorDot — neutral "·" used between meta items in the row eyebrow.
// from prototype direction-a.jsx :328 (color: #27272a).
// ---------------------------------------------------------------------------

export function SeparatorDot() {
  return <span className="text-[#27272a]">·</span>;
}
