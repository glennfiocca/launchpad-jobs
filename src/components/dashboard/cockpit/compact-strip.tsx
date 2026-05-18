"use client";

/**
 * Sticky compact manifold strip that pins below the navbar after the user
 * scrolls past the hero. Renders a 44px tall PipelineSankey + inline stage
 * filter chips. Opacity + translateY are driven by `useScrollProgress` over
 * the 120..340 px range (matches prototype direction-a.jsx :47-48).
 *
 * Honors `prefers-reduced-motion` by skipping the fade ramp — the strip is
 * either fully visible (collapseT > 0.5) or fully hidden.
 */

import { useReducedMotion } from "framer-motion";
import type { ApplicationStatus } from "@prisma/client";
import { PipelineSankey } from "@/components/sankey/pipeline-sankey";
import type { SankeyGraphData } from "@/lib/sankey";
import { useScrollProgress } from "@/hooks/use-scroll-progress";
import { FORWARD_STAGES, STAGE_TOKENS } from "./stage-tokens";

interface CompactStripProps {
  sankeyData: SankeyGraphData;
  activeStage: ApplicationStatus | null;
  hoverStage: ApplicationStatus | null;
  onStageHover: (stage: ApplicationStatus | null) => void;
  onStageClick: (stage: ApplicationStatus) => void;
  counts: Readonly<Record<ApplicationStatus, number>>;
}

export function CompactStrip({
  sankeyData,
  activeStage,
  hoverStage,
  onStageHover,
  onStageClick,
  counts,
}: CompactStripProps) {
  const reduced = useReducedMotion();
  // from prototype direction-a.jsx :48 — 120 start, 340 end (220px ramp)
  const collapseT = useScrollProgress(120, 340);

  // Under reduced motion: snap on/off at 0.5; never tween opacity.
  const opacity = reduced ? (collapseT > 0.5 ? 1 : 0) : collapseT;
  const translateY = reduced ? 0 : (1 - collapseT) * -20;
  const interactive = collapseT > 0.5;
  const showBorder = collapseT > 0;

  return (
    <div
      className="sticky z-40 bg-bg/92 backdrop-blur-xl py-[10px] px-8 transition-[border-color] duration-200"
      style={{
        // top references the navbar height token; single source of truth.
        top: "var(--navbar-h)",
        opacity,
        transform: `translateY(${translateY}px)`,
        pointerEvents: interactive ? "auto" : "none",
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: showBorder
          ? "var(--color-border)"
          : "transparent",
      }}
      aria-hidden={!interactive}
    >
      <div className="max-w-[1320px] mx-auto flex items-center gap-4">
        {/* Brand mini-label */}
        <div className="font-display text-[13px] font-medium tracking-[-0.02em] text-text flex items-baseline gap-[5px] min-w-[110px]">
          Your{" "}
          <em className="not-italic text-accent-lavender">pipeline</em>
        </div>

        {/* Compressed manifold — 44px tall, no labels, no dropoff text */}
        <div className="flex-1 h-11 relative">
          <PipelineSankey
            mode="live"
            data={sankeyData}
            chartHeight={44}
            showLabels={false}
            showDropoffLabels={false}
            hideCaption
            highlightStage={activeStage ?? hoverStage}
            onStageHover={onStageHover}
            onStageClick={onStageClick}
          />
        </div>

        {/* Stage chip row */}
        <div className="flex gap-1">
          {FORWARD_STAGES.map((stage) => {
            const isActive = activeStage === stage;
            const tokens = STAGE_TOKENS[stage];
            return (
              <button
                key={stage}
                type="button"
                onClick={() => onStageClick(stage)}
                onMouseEnter={() => onStageHover(stage)}
                onMouseLeave={() => onStageHover(null)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? // from prototype direction-a.jsx :97-99 (active chip)
                      "px-[10px] py-[5px] rounded-md text-[11px] font-mono flex items-center gap-[5px] cursor-pointer bg-[rgba(196,181,253,0.14)] border border-[rgba(196,181,253,0.3)] text-accent-lavender transition-colors"
                    : "px-[10px] py-[5px] rounded-md text-[11px] font-mono flex items-center gap-[5px] cursor-pointer bg-transparent border border-white/8 text-text-muted hover:border-white/16 transition-colors"
                }
              >
                <span
                  aria-hidden
                  className="w-[6px] h-[6px] rounded-full"
                  style={{ background: tokens.color }}
                />
                {tokens.label}
                <span className="text-text-dim tabular-nums">
                  {counts[stage] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
