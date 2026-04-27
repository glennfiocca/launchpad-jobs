"use client";

import { useMemo, useId } from "react";
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  type SankeyNode as D3SankeyNode,
  type SankeyLink as D3SankeyLink,
} from "d3-sankey";
import { motion, useReducedMotion } from "framer-motion";
import type { SankeyGraphData, SankeyNode, SankeyLink } from "@/lib/sankey";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineSankeyProps {
  mode: "live" | "demo";
  data: SankeyGraphData;
  className?: string;
  chartWidth?: number;
  chartHeight?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  nodePadding?: number;
  hideCaption?: boolean;
}

// ---------------------------------------------------------------------------
// Internal d3-sankey node/link types with layout coordinates
// ---------------------------------------------------------------------------

type LayoutNode = D3SankeyNode<SankeyNode, SankeyLink>;
type LayoutLink = D3SankeyLink<SankeyNode, SankeyLink>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 18;
const NODE_PAD = 24;

// Responsive dimensions — the SVG uses viewBox so it scales
const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const MARGIN = { top: 28, right: 100, bottom: 28, left: 100 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineSankey({
  mode, data, className,
  chartWidth = CHART_WIDTH,
  chartHeight = CHART_HEIGHT,
  margin = MARGIN,
  nodePadding = NODE_PAD,
  hideCaption = false,
}: PipelineSankeyProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientIdBase = useId();

  // Compute layout with d3-sankey
  const { nodes, links } = useMemo(() => {
    if (data.nodes.length === 0) return { nodes: [] as LayoutNode[], links: [] as LayoutLink[] };

    // d3-sankey mutates its inputs, so clone
    const nodesCopy = data.nodes.map((n) => ({ ...n }));
    const linksCopy = data.links.map((l) => ({ ...l }));

    const layout = d3Sankey<SankeyNode, SankeyLink>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(nodePadding)
      .nodeSort(null) // preserve our insertion order
      .extent([
        [margin.left, margin.top],
        [chartWidth - margin.right, chartHeight - margin.bottom],
      ]);

    const graph = layout({
      nodes: nodesCopy,
      links: linksCopy,
    });

    return {
      nodes: graph.nodes as LayoutNode[],
      links: graph.links as LayoutLink[],
    };
  }, [data, chartWidth, chartHeight, margin, nodePadding]);

  const linkPathGen = sankeyLinkHorizontal();

  // Empty state
  if (data.nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className ?? ""}`}>
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <p className="text-zinc-500 text-sm">
          {mode === "live"
            ? "Apply to jobs to see your pipeline"
            : "No pipeline data available"}
        </p>
      </div>
    );
  }

  // Animation config — respects prefers-reduced-motion
  const skipMotion = !!prefersReducedMotion;
  const ease = [0.22, 1, 0.36, 1] as const;

  const nodeDelay = (i: number) => (skipMotion ? 0 : i * 0.08);
  const nodeDuration = skipMotion ? 0 : 0.4;

  const linkDelay = (i: number) => (skipMotion ? 0 : 0.3 + i * 0.06);
  const linkDuration = skipMotion ? 0 : 0.6;

  const labelDelay = (i: number) => (skipMotion ? 0 : i * 0.08 + 0.15);
  const labelDuration = skipMotion ? 0 : 0.35;

  return (
    <div className={className}>
      {/* Caption */}
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

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Pipeline Sankey diagram showing ${data.totalApplications} applications across ${data.nodes.length} stages`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Gradient for each link */}
          {links.map((link, i) => {
            const src = link.source as LayoutNode;
            const tgt = link.target as LayoutNode;
            return (
              <linearGradient
                key={`grad-${i}`}
                id={`${gradientIdBase}-link-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={src.x1}
                x2={tgt.x0}
              >
                <stop offset="0%" stopColor={src.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={tgt.color} stopOpacity={0.2} />
              </linearGradient>
            );
          })}

          {/* Animated flow dash pattern */}
          {!skipMotion && (
            <pattern
              id={`${gradientIdBase}-flow`}
              patternUnits="userSpaceOnUse"
              width="20"
              height="4"
            >
              <rect width="20" height="4" fill="transparent" />
              <rect width="8" height="4" rx="2" fill="white" opacity="0.06">
                <animate
                  attributeName="x"
                  from="-8"
                  to="20"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </rect>
            </pattern>
          )}
        </defs>

        {/* Links */}
        <g fill="none">
          {links.map((link, i) => {
            const d = linkPathGen(link as Parameters<typeof linkPathGen>[0]);
            if (!d) return null;
            const width = Math.max((link.width ?? 1), 2);
            return (
              <g key={`link-${i}`}>
                <motion.path
                  d={d}
                  strokeWidth={width}
                  stroke={`url(#${gradientIdBase}-link-${i})`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: linkDelay(i), duration: linkDuration, ease }}
                />
                {/* Subtle flow overlay */}
                {!skipMotion && (
                  <path
                    d={d}
                    strokeWidth={width}
                    stroke={`url(#${gradientIdBase}-flow)`}
                    opacity={0.5}
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        {nodes.map((node, i) => {
          const x = node.x0 ?? 0;
          const y = node.y0 ?? 0;
          const w = (node.x1 ?? 0) - x;
          const h = (node.y1 ?? 0) - y;
          const isTerminal = ["REJECTED", "WITHDRAWN", "LISTING_REMOVED"].includes(node.id);

          return (
            <g key={node.id}>
              <title>{`${node.label}: ${node.count} application${node.count !== 1 ? "s" : ""}`}</title>
              {/* Node rectangle */}
              <motion.rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={4}
                fill={node.color}
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: isTerminal ? 0.7 : 0.9, scaleY: 1 }}
                transition={{ delay: nodeDelay(i), duration: nodeDuration, ease }}
                style={{ originX: `${x + w / 2}px`, originY: `${y + h / 2}px` }}
              />

              {/* Glow behind node */}
              <motion.rect
                x={x - 2}
                y={y - 2}
                width={w + 4}
                height={h + 4}
                rx={6}
                fill={node.color}
                initial={{ opacity: 0 }}
                animate={{ opacity: isTerminal ? 0 : 0.12 }}
                transition={{ delay: nodeDelay(i) + 0.3, duration: skipMotion ? 0 : 0.5 }}
                style={{ filter: "blur(8px)" }}
              />

              {/* Label — positioned to left or right of node */}
              <motion.text
                x={isTerminal ? (node.x1 ?? 0) + 8 : x - 8}
                y={y + h / 2}
                dy="0.35em"
                textAnchor={isTerminal ? "start" : "end"}
                className="text-[11px] font-medium fill-zinc-400 select-none"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: labelDelay(i), duration: labelDuration, ease: "easeOut" as const }}
              >
                {node.label}
              </motion.text>

              {/* Count */}
              <motion.text
                x={isTerminal ? (node.x1 ?? 0) + 8 : x - 8}
                y={y + h / 2 + 14}
                dy="0.35em"
                textAnchor={isTerminal ? "start" : "end"}
                className="text-[10px] fill-zinc-500 tabular-nums select-none"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: labelDelay(i), duration: labelDuration, ease: "easeOut" as const }}
              >
                {node.count}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
