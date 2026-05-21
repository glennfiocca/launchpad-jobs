"use client";

/**
 * ProfileSigil — the 8-axis closed-polygon hero of the profile page header.
 *
 * Each tab is one of 8 axes radiating from the center. The vertex on each
 * axis sits at (pct / 100) of maxRadius, so empty axes snap inward and you
 * can read which sections are still open at a glance. Empty axes still leave
 * a small notch (MIN_PCT) so the polygon never collapses to a single point.
 *
 * Per-vertex tooltips use Radix Popover (no shadcn) — they open on hover
 * (desktop) and on tap (mobile). The sigil itself is decorative; the
 * accessible summary lives in role="img" + aria-label + per-axis
 * <title> + <desc> for screen readers.
 *
 * Motion: each non-empty vertex pulses with a staggered glow loop. Gated
 * on framer-motion's useReducedMotion() — under reduced motion the pulse
 * resolves to the initial (un-pulsed) state.
 */

import { useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import {
  TAB_KEYS,
  TAB_LABELS,
  type TabKey,
} from "@/components/profile/forms/_shared/tab-config";
import type { PerSectionScore } from "@/lib/profile/completeness";
import {
  getTooltipCopy,
  type TooltipPartialContext,
} from "./sigil-tooltip-copy";

// ---------------------------------------------------------------------------
// Tab ordering on the sigil (top → clockwise). Locked in the handoff spec —
// Personal sits at the top so the user reads themselves first.
// ---------------------------------------------------------------------------
const SIGIL_ORDER: ReadonlyArray<TabKey> = TAB_KEYS;

// Stage palette — mirrors the cockpit's STAGE_TOKENS order so the same color
// vocabulary applies wherever a stage marker is rendered.
const STAGE_COLOR_BY_INDEX: ReadonlyArray<string> = [
  "var(--color-stage-applied)",    // 0  personal
  "var(--color-stage-reviewing)",  // 1  professional
  "var(--color-stage-phone)",      // 2  work-history
  "var(--color-stage-interview)",  // 3  education
  "var(--color-stage-offer)",      // 4  skills-languages
  "var(--color-stage-applied)",    // 5  projects-certs (repeats)
  "var(--color-stage-reviewing)",  // 6  resume (repeats)
  "var(--color-stage-phone)",      // 7  preferences (repeats)
];

// Short axis labels — must fit the perimeter. Locked by the prototype.
const SHORT_LABELS: Record<TabKey, string> = {
  personal: "Personal",
  professional: "Pro.",
  "work-history": "Work",
  education: "Educ.",
  "skills-languages": "Skills",
  "projects-certs": "Projects",
  resume: "Resume",
  preferences: "Prefs.",
};

// Smallest fraction of maxR that an empty vertex collapses to. Keeps the
// shape readable; 0 would collapse the polygon to a point on a brand-new
// profile.
const MIN_PCT = 8;

// Cardinal-spline cubic-bezier smoother — port of the prototype's
// `smooth(pts, tension)` helper. Pure function, easy to test.
interface Vertex {
  readonly x: number;
  readonly y: number;
}

function buildSmoothPath(pts: ReadonlyArray<Vertex>, tension = 0.22): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1 = {
      x: p1.x + (p2.x - p0.x) * tension,
      y: p1.y + (p2.y - p0.y) * tension,
    };
    const c2 = {
      x: p2.x - (p3.x - p1.x) * tension,
      y: p2.y - (p3.y - p1.y) * tension,
    };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d + " Z";
}

interface SigilProps {
  perSection: PerSectionScore;
  totalPct: number;
  /** Optional context (e.g. {filled, total}) for proportional axes — used
   *  by the per-vertex tooltip body. */
  partialContext?: Partial<Record<TabKey, TooltipPartialContext>>;
  /** Default 380. Smaller sizes (e.g. 260) drop the perimeter labels so the
   *  sigil reads as a glyph rather than a chart. */
  size?: number;
  /** When true, drop the perimeter axis labels (used at < 640px). */
  hideLabels?: boolean;
  /** When false, the sigil renders as a glyph only — no per-vertex tooltips,
   *  no center % label, no "YOUR SIGIL" caption. Used by the sticky compressed
   *  header at ~36px where the dots are too small to hit reliably. */
  showInteractions?: boolean;
  /** When false, drop the center total % + "YOUR SIGIL" caption. Defaults to
   *  true so the hero sigil is unchanged. */
  showCenter?: boolean;
}

export function Sigil({
  perSection,
  totalPct,
  partialContext,
  size = 380,
  hideLabels = false,
  showInteractions = true,
  showCenter = true,
}: SigilProps) {
  const reduced = useReducedMotion();
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const n = SIGIL_ORDER.length;

  // -90° (top) walking clockwise.
  const angleFor = (i: number): number => -Math.PI / 2 + (i / n) * Math.PI * 2;

  // Verts for the actual polygon. Each axis snaps inward proportional to pct.
  const verts: ReadonlyArray<Vertex> = SIGIL_ORDER.map((key, i) => {
    const pct = perSection[key];
    const r = (Math.max(MIN_PCT, pct) / 100) * maxR;
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

  // Envelope = the 100% silhouette, drawn beneath the filled shape so the
  // user sees the target they're filling toward.
  const envVerts: ReadonlyArray<Vertex> = SIGIL_ORDER.map((_, i) => {
    const a = angleFor(i);
    return { x: cx + Math.cos(a) * maxR, y: cy + Math.sin(a) * maxR };
  });

  const filledPath = buildSmoothPath(verts);
  const envelopePath = buildSmoothPath(envVerts);

  // Build the screen-reader-friendly axis summary so the SVG itself remains
  // a single decorative role="img" with an aria-label + a desc full enough
  // to enumerate every axis.
  const ariaLabel = `Profile sigil — ${totalPct}% complete across ${n} sections.`;
  const ariaDesc = SIGIL_ORDER.map(
    (key) => `${TAB_LABELS[key]}: ${perSection[key]} percent.`,
  ).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", maxWidth: size }}
    >
      <title>{ariaLabel}</title>
      <desc>{ariaDesc}</desc>

      <defs>
        <radialGradient id="sigilFill" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="var(--color-accent-lavender)" stopOpacity="0.45" />
          <stop offset="55%" stopColor="var(--color-accent-light)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.10" />
        </radialGradient>
        <linearGradient
          id="sigilStroke"
          x1="0"
          y1="0"
          x2={size}
          y2={size}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--color-accent-lavender)" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="var(--color-accent-light)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--color-accent-cyan)" stopOpacity="0.95" />
        </linearGradient>
        <filter id="sigilGlow">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="sigilDot">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* Concentric guide rings at 25/50/75/100% */}
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <circle
          key={p}
          cx={cx}
          cy={cy}
          r={maxR * p}
          fill="none"
          stroke={
            p === 1
              ? "rgba(245,244,241,0.10)"
              : "rgba(245,244,241,0.05)"
          }
          strokeDasharray={p === 1 ? "0" : "2 4"}
        />
      ))}

      {/* Spokes — one dashed faint line per axis */}
      {SIGIL_ORDER.map((_, i) => {
        const a = angleFor(i);
        const x2 = cx + Math.cos(a) * maxR;
        const y2 = cy + Math.sin(a) * maxR;
        return (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="rgba(245,244,241,0.06)"
            strokeDasharray="2 3"
          />
        );
      })}

      {/* Envelope = the 100% target silhouette */}
      <path
        d={envelopePath}
        fill="none"
        stroke="rgba(196,181,253,0.18)"
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* Filled sigil — glow halo + solid fill + stroke */}
      <path
        d={filledPath}
        fill="url(#sigilFill)"
        filter="url(#sigilGlow)"
        opacity={0.85}
      />
      <path d={filledPath} fill="url(#sigilFill)" />
      <path
        d={filledPath}
        fill="none"
        stroke="url(#sigilStroke)"
        strokeWidth={1.8}
        strokeLinejoin="round"
        style={{
          filter: "drop-shadow(0 0 6px rgba(196,181,253,0.35))",
        }}
      />

      {/* Per-axis vertex marks + interactive tooltip target */}
      {verts.map((v, i) => {
        const key = SIGIL_ORDER[i];
        const pct = perSection[key];
        const empty = pct === 0;
        const color = STAGE_COLOR_BY_INDEX[i];
        // Stagger the pulse so the sigil reads as a living artifact. Skipped
        // under reduced motion (resolves to the initial un-pulsed state).
        const pulseStyle: CSSProperties = reduced
          ? {}
          : {
              animation:
                "pp-pulse-glow 2.4s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
              transformOrigin: `${v.x}px ${v.y}px`,
            };

        return (
          <g key={`vertex-${i}`} style={pulseStyle}>
            {!empty && (
              <circle
                cx={v.x}
                cy={v.y}
                r={6}
                fill={color}
                opacity={0.45}
                filter="url(#sigilDot)"
              />
            )}
            {showInteractions ? (
              <SigilVertex
                tab={key}
                pct={pct}
                color={color}
                x={v.x}
                y={v.y}
                empty={empty}
                partialContext={partialContext?.[key]}
              />
            ) : (
              // Mini-mode: just the dot, no popover trigger / hit area.
              <circle
                cx={v.x}
                cy={v.y}
                r={empty ? 2.5 : 3.5}
                fill={empty ? "rgba(245,244,241,0.30)" : "var(--color-text)"}
                stroke={empty ? "rgba(245,244,241,0.18)" : color}
                strokeWidth={empty ? 1 : 1.4}
              />
            )}
          </g>
        );
      })}

      {/* Perimeter labels — eyebrow + value per axis */}
      {!hideLabels &&
        SIGIL_ORDER.map((key, i) => {
          const a = angleFor(i);
          const lr = maxR + 20;
          const lx = cx + Math.cos(a) * lr;
          const ly = cy + Math.sin(a) * lr;
          const pct = perSection[key];
          const empty = pct === 0;
          return (
            <g key={`label-${i}`}>
              <text
                x={lx}
                y={ly - 4}
                textAnchor="middle"
                className="tabular-nums"
                fontFamily="var(--font-mono)"
                fontSize={9}
                letterSpacing="0.06em"
                fill={
                  empty
                    ? "var(--color-text-dim)"
                    : "var(--color-text-dim)"
                }
              >
                {SHORT_LABELS[key].toUpperCase()}
              </text>
              <text
                x={lx}
                y={ly + 9}
                textAnchor="middle"
                className="tabular-nums"
                fontFamily="var(--font-display)"
                fontSize={13}
                fontWeight={500}
                letterSpacing="-0.02em"
                fill={
                  empty
                    ? "var(--color-text-dim)"
                    : "var(--color-text)"
                }
              >
                {empty ? "—" : `${pct}%`}
              </text>
            </g>
          );
        })}

      {/* Center label — total % and YOUR SIGIL caption */}
      {showCenter && (
        <>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="tabular-nums"
            fontFamily="var(--font-display)"
            fontSize={48}
            fontWeight={500}
            letterSpacing="-0.04em"
            fill="var(--color-accent-lavender)"
          >
            {totalPct}
            <tspan fontSize={22} fill="var(--color-text-dim)">
              %
            </tspan>
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={9.5}
            letterSpacing="0.10em"
            fill="var(--color-text-dim)"
          >
            YOUR SIGIL
          </text>
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SigilVertex — one vertex circle + its Radix Popover tooltip target.
// Split out so each vertex tracks its own open state for the popover.
// ---------------------------------------------------------------------------

interface SigilVertexProps {
  tab: TabKey;
  pct: number;
  color: string;
  x: number;
  y: number;
  empty: boolean;
  partialContext?: TooltipPartialContext;
}

function SigilVertex({
  tab,
  pct,
  color,
  x,
  y,
  empty,
  partialContext,
}: SigilVertexProps) {
  const [open, setOpen] = useState(false);
  const copy = getTooltipCopy(tab, pct, partialContext);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* The visible vertex dot doubles as the popover trigger. We render
            a transparent "hit area" circle at r=12 underneath so taps + hovers
            register reliably even on small (r=3.5) dots. */}
        <g
          tabIndex={0}
          role="button"
          aria-label={`${TAB_LABELS[tab]} — ${pct}% complete. Click to read more.`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          style={{ cursor: "pointer", outline: "none" }}
        >
          <circle cx={x} cy={y} r={12} fill="transparent" />
          <circle
            cx={x}
            cy={y}
            r={empty ? 2.5 : 3.5}
            fill={empty ? "rgba(245,244,241,0.30)" : "var(--color-text)"}
            stroke={empty ? "rgba(245,244,241,0.18)" : color}
            strokeWidth={empty ? 1 : 1.4}
          />
        </g>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={8}
          className="z-50 max-w-[260px] rounded-[10px] border border-white/10 bg-bg-elev px-3.5 py-2.5 shadow-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-accent-lavender)]">
            {copy.title} · <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-text">
            {copy.body}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
