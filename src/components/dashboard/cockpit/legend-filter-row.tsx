"use client";

/**
 * 5-cell stage filter row beneath the hero manifold. One cell per forward
 * stage; each is a toggle (`aria-pressed`) that drives the cockpit's
 * `activeStage`. Translated from prototype direction-a.jsx :186-227.
 */

import type { ApplicationStatus } from "@prisma/client";
import { FORWARD_STAGES, STAGE_TOKENS } from "./stage-tokens";

interface LegendFilterRowProps {
  counts: Readonly<Record<ApplicationStatus, number>>;
  total: number;
  activeStage: ApplicationStatus | null;
  onStageClick: (stage: ApplicationStatus) => void;
  onStageHover: (stage: ApplicationStatus | null) => void;
}

export function LegendFilterRow({
  counts,
  total,
  activeStage,
  onStageClick,
  onStageHover,
}: LegendFilterRowProps) {
  return (
    <div
      // from prototype direction-a.jsx :187-191 — 5-col grid w/ 1px gap as border seam
      className="mt-3 grid grid-cols-5 gap-px bg-border border border-border rounded-xl overflow-hidden"
    >
      {FORWARD_STAGES.map((stage) => {
        const count = counts[stage] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        const isActive = activeStage === stage;
        const tokens = STAGE_TOKENS[stage];
        return (
          <button
            key={stage}
            type="button"
            aria-pressed={isActive}
            onClick={() => onStageClick(stage)}
            onMouseEnter={() => onStageHover(stage)}
            onMouseLeave={() => onStageHover(null)}
            // from prototype direction-a.jsx :199-204 — 16/18 padding, bg toggles on active
            className={
              "relative px-[18px] pt-4 pb-[14px] text-left border-none text-text cursor-pointer transition-colors " +
              (isActive
                ? "bg-[rgba(196,181,253,0.06)]"
                : "bg-bg hover:bg-[rgba(196,181,253,0.03)]")
            }
          >
            <span
              aria-hidden
              // from prototype direction-a.jsx :205-210 — top-right 6px glow dot
              className="absolute top-4 right-4 w-[6px] h-[6px] rounded-full"
              style={{
                background: tokens.color,
                boxShadow: `0 0 8px ${tokens.color}`,
              }}
            />
            {/* Stage label — mono uppercase 10px */}
            <div className="font-mono text-[10px] text-text-dim tracking-[0.06em] uppercase">
              {tokens.label}
            </div>
            {/* Count + percentage line — display 24px, mono 11px for the percent */}
            <div className="mt-[5px] flex items-baseline gap-[6px] font-display font-medium text-[24px] tracking-[-0.02em] leading-none tabular-nums">
              {count}
              <span className="font-mono text-[11px] text-text-dim font-normal">
                {pct.toFixed(0)}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
