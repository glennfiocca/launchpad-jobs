"use client";

/**
 * PipelineSankey — editorial "manifold" visualization.
 *
 * A horizontal flowing band (cubic-Bézier path) connecting the five forward
 * pipeline stages, with drop-off shapes between adjacent stages where counts
 * decrease, a tiered particle stream flowing left-to-right, pulsing stage
 * markers, and a one-shot reveal wipe on mount.
 *
 * Architecture ported from the design-handoff mock's `EdManifold`. CSS-only
 * infinite animations (particles + marker pulse) keep per-frame work off the
 * React tree. Reveal wipe uses a single rAF cubic-out ramp on a clipPath rect
 * for one cycle. All animations are disabled under `prefers-reduced-motion`.
 *
 * Props compatibility: keeps the existing `data: SankeyGraphData` contract so
 * the homepage + dashboard call-sites need no changes. `chartHeight`, `margin`,
 * `nodePadding` are accepted for backward compat but only `chartHeight` still
 * influences layout (the manifold doesn't use d3-sankey margins).
 */

import { useEffect, useId, useMemo, useState, type ReactElement } from "react";
import { useReducedMotion } from "framer-motion";
import type { ApplicationStatus } from "@prisma/client";
import type { SankeyGraphData } from "@/lib/sankey";

// ---------------------------------------------------------------------------
// Stage palette — mirrors --color-stage-* tokens in globals.css.
// Kept locally because SVG `fill`, `stroke`, gradient `stop-color`, etc. all
// need concrete hex values rather than CSS custom-property references.
// ---------------------------------------------------------------------------

interface StagePaletteEntry {
  readonly id: ApplicationStatus;
  readonly label: string;
  readonly color: string;
  readonly accent: string;
}

const STAGE_PALETTE: ReadonlyArray<StagePaletteEntry> = [
  { id: "APPLIED",      label: "Applied",      color: "#6366f1", accent: "#818cf8" },
  { id: "REVIEWING",    label: "Reviewing",    color: "#8b5cf6", accent: "#a78bfa" },
  { id: "PHONE_SCREEN", label: "Phone Screen", color: "#a855f7", accent: "#c084fc" },
  { id: "INTERVIEWING", label: "Interview",    color: "#d946ef", accent: "#e879f9" },
  { id: "OFFER",        label: "Offer",        color: "#22d3ee", accent: "#67e8f9" },
] as const;

// ---------------------------------------------------------------------------
// Geometry constants — calibrated against the mock's EdManifold defaults.
// ---------------------------------------------------------------------------

const VIEW_WIDTH = 1100;
const DEFAULT_VIEW_HEIGHT = 280;
const PAD_LEFT = 60;
const PAD_RIGHT = 60;
const PAD_TOP = 40;
const PAD_BOTTOM = 60;
const PARTICLE_COUNT = 60;
const PARTICLE_DUR_SECONDS = 8;
const REVEAL_DURATION_MS = 1400;
const MARKER_STAGGER_SECONDS = 0.28;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineSankeyProps {
  data: SankeyGraphData;
  mode?: "live" | "demo";
  className?: string;
  /** Optional vertical compaction (used by dashboard mini view). */
  chartHeight?: number;
  /** Hide the optional header caption above the chart. */
  hideCaption?: boolean;
  // The following props are accepted for backward compatibility with the
  // previous d3-sankey implementation but are no longer used by the
  // manifold renderer. They remain in the signature so existing call-sites
  // continue to type-check without churn.
  chartWidth?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  nodePadding?: number;
}

// ---------------------------------------------------------------------------
// Derived stage row used by the renderer
// ---------------------------------------------------------------------------

interface ManifoldStage extends StagePaletteEntry {
  count: number;
}

interface Particle {
  cx: number;
  cy: number;
  tier: 0 | 1 | 2 | 3 | 4;
  delaySeconds: number;
  travel: number;
  radius: number;
  color: string;
}

interface DropOffShape {
  d: string;
  lost: number;
  labelX: number;
  labelY: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Deterministic 0..1 hash so particle layout is stable across renders. */
function seed(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Map a SankeyGraphData's nodes onto the fixed 5-stage palette. */
function deriveStages(data: SankeyGraphData): ReadonlyArray<ManifoldStage> {
  const countById = new Map<string, number>();
  for (const node of data.nodes) {
    countById.set(node.id, node.count);
  }
  return STAGE_PALETTE.map((entry) => ({
    ...entry,
    count: countById.get(entry.id) ?? 0,
  }));
}

interface BandGeometry {
  colX: (i: number) => number;
  bandH: (count: number) => number;
  centerY: number;
  maxCount: number;
}

function buildGeometry(stages: ReadonlyArray<ManifoldStage>, width: number, height: number): BandGeometry {
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  // Use the first stage as the band-height normalizer (it's always the largest
  // by definition; falling back to 1 prevents NaN if applications.length === 0).
  const maxCount = Math.max(1, stages[0]?.count ?? 1);
  const lastIdx = Math.max(1, stages.length - 1);
  return {
    colX: (i) => PAD_LEFT + (innerW * i) / lastIdx,
    bandH: (count) => Math.max(8, (count / maxCount) * innerH * 0.85),
    centerY: height / 2 - 6,
    maxCount,
  };
}

/** Closed cubic-Bézier path enclosing the top + bottom edges of the band. */
function buildFlowPath(stages: ReadonlyArray<ManifoldStage>, geom: BandGeometry): string {
  const points = stages.map((s, i) => ({
    x: geom.colX(i),
    top: geom.centerY - geom.bandH(s.count) / 2,
    bot: geom.centerY + geom.bandH(s.count) / 2,
  }));

  let d = `M ${points[0].x} ${points[0].top}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C ${cpx} ${p0.top}, ${cpx} ${p1.top}, ${p1.x} ${p1.top}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].bot}`;
  for (let i = points.length - 1; i > 0; i--) {
    const p0 = points[i];
    const p1 = points[i - 1];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C ${cpx} ${p0.bot}, ${cpx} ${p1.bot}, ${p1.x} ${p1.bot}`;
  }
  d += " Z";
  return d;
}

/** Closed shape for the gray drop-off between adjacent stages where count falls. */
function buildDropOff(
  stages: ReadonlyArray<ManifoldStage>,
  geom: BandGeometry,
  i: number,
  height: number,
): DropOffShape | null {
  const s0 = stages[i];
  const s1 = stages[i + 1];
  const lost = s0.count - s1.count;
  if (lost <= 0) return null;

  const x0 = geom.colX(i);
  const x1 = geom.colX(i + 1);
  const t0 = geom.centerY + geom.bandH(s0.count) / 2;
  const t1 = geom.centerY + geom.bandH(s1.count) / 2;
  const dropY = Math.min(height - 14, t1 + Math.max(18, geom.bandH(lost) * 0.45));
  const cpx = (x0 + x1) / 2;
  const tail = Math.max(2, Math.min(12, geom.bandH(lost) * 0.35));
  const head = Math.min(14, geom.bandH(lost) * 0.2);

  let d = `M ${x0} ${t0}`;
  d += ` C ${cpx} ${t0}, ${cpx} ${dropY}, ${x1} ${dropY}`;
  d += ` L ${x1} ${dropY + tail}`;
  d += ` C ${cpx} ${dropY + tail}, ${cpx} ${t0 + head}, ${x0} ${t0 + head}`;
  d += " Z";

  return { d, lost, labelX: cpx, labelY: dropY + 18 };
}

/**
 * Build a deterministic, tier-stratified particle set.
 *
 * For each of N particles:
 *   1. Run a "survival roll" across stages — at each transition i→i+1 the
 *      particle survives with probability `stages[i+1].count / stages[i].count`.
 *   2. The tier is the highest stage index it survived through.
 *   3. Its vertical lane is clamped to ± half the band height at the *next*
 *      stage (so it physically fits inside the funnel even at its narrowest
 *      reached point — no clipping through the perimeter).
 *   4. Delay is negative so particles are pre-staggered across the cycle.
 */
function buildParticles(
  stages: ReadonlyArray<ManifoldStage>,
  geom: BandGeometry,
  width: number,
): ReadonlyArray<Particle> {
  const travelStart = PAD_LEFT - 8;
  const travelEnd = width - PAD_RIGHT + 8;
  const travel = travelEnd - travelStart;

  // Per-transition survival probability. Stage 0 is always the entry point.
  const survivals = stages.map((_, i) =>
    i === 0 ? 1 : Math.min(1, stages[i].count / Math.max(1, stages[i - 1].count)),
  );

  // Half-range vertical bound per tier — uses the band height at the next
  // stage (or the same stage for the final tier) so a particle never clips
  // through the perimeter at its narrowest point.
  const laneBound = stages.map((_, i) => {
    const checkIdx = Math.min(stages.length - 1, i + 1);
    return Math.max(0.6, geom.bandH(stages[checkIdx].count) / 2 - 3.5);
  });

  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let tier: 0 | 1 | 2 | 3 | 4 = 0;
    for (let k = 1; k < stages.length; k++) {
      if (seed(i * 17.3 + k * 3.1) < survivals[k]) {
        tier = k as 0 | 1 | 2 | 3 | 4;
      } else {
        break;
      }
    }
    const lane = (seed(i * 11.7) - 0.5) * 2 * laneBound[tier];
    const cy = geom.centerY + lane;
    const delaySeconds = -seed(i * 23.5) * PARTICLE_DUR_SECONDS;
    const radius = 2.0 + seed(i * 7.9) * 1.2;
    const color = stages[tier].accent;
    particles.push({ cx: travelStart, cy, tier, delaySeconds, travel, radius, color });
  }
  return particles;
}

// ---------------------------------------------------------------------------
// Reveal wipe hook — cubic-out ramp from 0 → 1 over 1.4s on mount.
// ---------------------------------------------------------------------------

function useRevealProgress(skip: boolean): number {
  const [t, setT] = useState<number>(skip ? 1 : 0);

  useEffect(() => {
    if (skip) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number): void => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / REVEAL_DURATION_MS);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [skip]);

  return t;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineSankey({
  data,
  mode = "live",
  className,
  chartHeight = DEFAULT_VIEW_HEIGHT,
  hideCaption = false,
}: PipelineSankeyProps): ReactElement {
  const prefersReducedMotion = useReducedMotion();
  const skipMotion = !!prefersReducedMotion;
  const idBase = useId().replace(/:/g, "");

  const width = VIEW_WIDTH;
  const height = chartHeight;

  // Derive stage rows from the incoming graph data once per data change.
  const stages = useMemo(() => deriveStages(data), [data]);
  const geom = useMemo(() => buildGeometry(stages, width, height), [stages, width, height]);
  const flowPath = useMemo(() => buildFlowPath(stages, geom), [stages, geom]);
  const dropOffs = useMemo(
    () => stages.slice(0, -1).map((_, i) => buildDropOff(stages, geom, i, height)),
    [stages, geom, height],
  );
  const particles = useMemo(() => buildParticles(stages, geom, width), [stages, geom, width]);

  const revealT = useRevealProgress(skipMotion);

  // Empty state — total of 0 applications means no useful chart to render.
  if (data.totalApplications === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className ?? ""}`}>
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>
        <p className="text-zinc-500 text-sm">
          {mode === "live" ? "Apply to jobs to see your pipeline" : "No pipeline data available"}
        </p>
      </div>
    );
  }

  // Stable per-instance SVG ids (avoids collisions if more than one chart
  // mounts on the same page, e.g. in storybook or a demo grid).
  const flowFillId = `manifold-flow-fill-${idBase}`;
  const dropGradId = `manifold-drop-grad-${idBase}`;
  const glowFilterId = `manifold-glow-${idBase}`;
  const glowSmallFilterId = `manifold-glow-sm-${idBase}`;
  const revealClipId = `manifold-reveal-${idBase}`;
  const bandClipId = `manifold-band-${idBase}`;

  return (
    <div className={className}>
      {!hideCaption && (
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-400">
              {mode === "demo" ? "Sample Pipeline" : "Your Pipeline"}
            </h2>
            {mode === "demo" && (
              <span className="text-[10px] uppercase tracking-wider text-zinc-600 bg-white/5 px-2 py-0.5 rounded-full">
                Illustrative
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-600 tabular-nums">
            {data.totalApplications} application{data.totalApplications !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`Pipeline manifold showing ${data.totalApplications} application${data.totalApplications !== 1 ? "s" : ""} across ${stages.length} stages`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Horizontal stage-color gradient for the flow band fill. */}
          <linearGradient
            id={flowFillId}
            x1="0"
            y1="0"
            x2={width}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            {stages.map((s, i) => (
              <stop
                key={s.id}
                offset={`${(i / (stages.length - 1)) * 100}%`}
                stopColor={s.color}
                stopOpacity="0.5"
              />
            ))}
          </linearGradient>

          {/* Vertical gray gradient for the drop-off shapes. */}
          <linearGradient id={dropGradId} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#52525b" stopOpacity="0.45" />
            <stop offset="1" stopColor="#27272a" stopOpacity="0.12" />
          </linearGradient>

          <filter id={glowFilterId}>
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id={glowSmallFilterId}>
            <feGaussianBlur stdDeviation="2" />
          </filter>

          {/* Reveal wipe — rect width drives the visible region on mount. */}
          <clipPath id={revealClipId}>
            <rect x="0" y="0" width={width * revealT} height={height} />
          </clipPath>

          {/* Particle containment — the flow path itself, as a guarantee. */}
          <clipPath id={bandClipId}>
            <path d={flowPath} />
          </clipPath>
        </defs>

        {/* Faint vertical column guides */}
        {stages.map((s, i) => (
          <line
            key={`grid-${s.id}`}
            x1={geom.colX(i)}
            y1={PAD_TOP}
            x2={geom.colX(i)}
            y2={height - 18}
            stroke="rgba(245,244,241,0.04)"
            strokeDasharray="2 4"
          />
        ))}

        {/* Reveal-clipped body */}
        <g clipPath={`url(#${revealClipId})`}>
          {/* Drop-off shapes sit underneath the band. */}
          {dropOffs.map((dp, i) =>
            dp ? <path key={`drop-${stages[i].id}`} d={dp.d} fill={`url(#${dropGradId})`} /> : null,
          )}

          {/* Soft glow halo + solid fill. */}
          <path d={flowPath} fill={`url(#${flowFillId})`} filter={`url(#${glowFilterId})`} opacity="0.7" />
          <path d={flowPath} fill={`url(#${flowFillId})`} />

          {/* Defined perimeter + glow stroke. */}
          <path
            d={flowPath}
            fill="none"
            stroke="rgba(245,244,241,0.55)"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d={flowPath}
            fill="none"
            stroke={`url(#${flowFillId})`}
            strokeWidth="2"
            strokeOpacity="0.6"
            filter={`url(#${glowFilterId})`}
          />

          {/* Stage markers — solid 4px bar + pulsing soft glow rect. */}
          {stages.map((s, i) => {
            const x = geom.colX(i);
            const h = geom.bandH(s.count);
            return (
              <g key={`mk-${s.id}`}>
                <rect
                  x={x - 2}
                  y={geom.centerY - h / 2}
                  width="4"
                  height={h}
                  fill={s.color}
                  opacity="0.95"
                />
                <rect
                  className="manifold-marker-glow"
                  x={x - 4}
                  y={geom.centerY - h / 2 - 2}
                  width="8"
                  height={h + 4}
                  fill={s.color}
                  filter={`url(#${glowFilterId})`}
                  style={{ animationDelay: `${i * MARKER_STAGGER_SECONDS}s` }}
                />
              </g>
            );
          })}

          {/* Particle stream — clipped to the band path. */}
          <g clipPath={`url(#${bandClipId})`}>
            {particles.map((p, i) => (
              <g
                key={`pt-${i}`}
                className={`manifold-particle t${p.tier}`}
                style={{
                  // CSS custom props consumed by .manifold-particle / @keyframes.
                  ["--travel" as string]: `${p.travel}px`,
                  ["--dur" as string]: `${PARTICLE_DUR_SECONDS}s`,
                  ["--delay" as string]: `${p.delaySeconds}s`,
                }}
              >
                <circle
                  cx={p.cx}
                  cy={p.cy}
                  r={p.radius + 1.6}
                  fill={p.color}
                  opacity="0.45"
                  filter={`url(#${glowSmallFilterId})`}
                />
                <circle cx={p.cx} cy={p.cy} r={p.radius} fill="#fefefe" />
                <circle cx={p.cx} cy={p.cy} r={p.radius} fill={p.color} opacity="0.55" />
              </g>
            ))}
          </g>
        </g>

        {/* Stage labels — name + mono count, above each column. */}
        {stages.map((s, i) => {
          const x = geom.colX(i);
          const h = geom.bandH(s.count);
          const yTop = geom.centerY - h / 2;
          return (
            <g key={`lbl-${s.id}`}>
              <text
                x={x}
                y={yTop - 28}
                textAnchor="middle"
                fontFamily="var(--font-mono), ui-monospace, monospace"
                fontSize="10"
                fill="#71717a"
                letterSpacing="0.08em"
              >
                {s.count}
              </text>
              <text
                x={x}
                y={yTop - 12}
                textAnchor="middle"
                fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
                fontSize="13"
                fill="#f5f4f1"
                fontWeight="500"
              >
                {s.label}
              </text>
            </g>
          );
        })}

        {/* Drop-off labels — "−N closed" below each gap. */}
        {dropOffs.map((dp, i) =>
          dp ? (
            <text
              key={`dlbl-${stages[i].id}`}
              x={dp.labelX}
              y={dp.labelY + 10}
              textAnchor="middle"
              fontFamily="var(--font-mono), ui-monospace, monospace"
              fontSize="10"
              fill="#71717a"
              letterSpacing="0.04em"
            >
              {`−${dp.lost} closed`}
            </text>
          ) : null,
        )}

        {/* Demo-mode watermark — very subtle "DEMO DATA" stamp in the corner
            so signed-out visitors clearly understand the chart is sample data. */}
        {mode === "demo" && (
          <text
            x={width - PAD_RIGHT}
            y={height - 6}
            textAnchor="end"
            fontFamily="var(--font-mono), ui-monospace, monospace"
            fontSize="9"
            fill="#f5f4f1"
            opacity="0.18"
            letterSpacing="0.18em"
          >
            DEMO DATA
          </text>
        )}
      </svg>
    </div>
  );
}
