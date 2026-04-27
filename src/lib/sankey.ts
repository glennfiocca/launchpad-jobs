/**
 * Sankey diagram data model and builder functions.
 *
 * Transforms application data (live or demo) into a graph of
 * nodes (pipeline stages) and links (transition flows) that
 * d3-sankey can lay out.
 */

import type { ApplicationStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SankeyNode {
  id: string;
  label: string;
  color: string;
  /** Count of applications currently at this stage */
  count: number;
}

export interface SankeyLink {
  source: string; // node id
  target: string; // node id
  value: number;  // flow volume
}

export interface SankeyGraphData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalApplications: number;
}

// ---------------------------------------------------------------------------
// Stage definitions — ordered pipeline stages + terminal states
// ---------------------------------------------------------------------------

/** Forward-progress stages in pipeline order */
const PIPELINE_STAGES: ApplicationStatus[] = [
  "APPLIED",
  "REVIEWING",
  "PHONE_SCREEN",
  "INTERVIEWING",
  "OFFER",
];

/** Terminal / exit states (branching off the pipeline) */
const TERMINAL_STAGES: ApplicationStatus[] = [
  "REJECTED",
  "WITHDRAWN",
  "LISTING_REMOVED",
];

/** Color mapping aligned with STATUS_CONFIG in src/types/index.ts */
const STAGE_COLORS: Record<ApplicationStatus, string> = {
  APPLIED: "#3b82f6",        // blue-500
  REVIEWING: "#eab308",      // yellow-500
  PHONE_SCREEN: "#a855f7",   // purple-500
  INTERVIEWING: "#f97316",   // orange-500
  OFFER: "#22c55e",          // green-500
  REJECTED: "#ef4444",       // red-500
  WITHDRAWN: "#71717a",      // zinc-500
  LISTING_REMOVED: "#71717a", // zinc-500
};

const STAGE_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  REVIEWING: "Reviewing",
  PHONE_SCREEN: "Screen",
  INTERVIEWING: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  LISTING_REMOVED: "Removed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stageIndex(status: ApplicationStatus): number {
  return PIPELINE_STAGES.indexOf(status);
}

/**
 * Determine the highest pipeline stage an application reached.
 * Uses statusHistory to find the deepest forward stage, falling back to
 * the current status if no history is available.
 */
function highestForwardStage(
  currentStatus: ApplicationStatus,
  history: ReadonlyArray<{ fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus }>,
): ApplicationStatus {
  let maxIdx = stageIndex(currentStatus);

  for (const h of history) {
    const fromIdx = h.fromStatus ? stageIndex(h.fromStatus) : -1;
    const toIdx = stageIndex(h.toStatus);
    if (fromIdx > maxIdx) maxIdx = fromIdx;
    if (toIdx > maxIdx) maxIdx = toIdx;
  }

  // If the current status is terminal but we found a forward stage, use that
  if (maxIdx >= 0) return PIPELINE_STAGES[maxIdx];

  // Application might only have terminal status with no history
  return currentStatus;
}

// ---------------------------------------------------------------------------
// Builder: live data
// ---------------------------------------------------------------------------

interface ApplicationInput {
  status: ApplicationStatus;
  statusHistory: ReadonlyArray<{
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
  }>;
}

/**
 * Build Sankey graph data from a user's real applications.
 *
 * Model:
 * - Every application enters at "Applied"
 * - It flows forward through pipeline stages it passed through
 * - If it ended in a terminal state, it exits from the deepest
 *   forward stage it reached
 * - Applications still active at a forward stage stay there
 *   (no exit link — they're "in the pipe")
 */
export function buildSankeyFromApplications(
  applications: ReadonlyArray<ApplicationInput>,
): SankeyGraphData {
  const total = applications.length;
  if (total === 0) {
    return { nodes: [], links: [], totalApplications: 0 };
  }

  // Count how many applications passed through each forward stage
  const passedThrough: Record<string, number> = {};
  // Count how many exited to a terminal state from each forward stage
  const exitedFrom: Record<string, Record<string, number>> = {};

  for (const app of applications) {
    const highest = highestForwardStage(app.status, app.statusHistory);
    const highestIdx = stageIndex(highest);
    const isTerminal = TERMINAL_STAGES.includes(app.status);
    const isForward = PIPELINE_STAGES.includes(app.status);

    // Mark all stages this application passed through (up to and including highest)
    for (let i = 0; i <= Math.max(highestIdx, 0); i++) {
      const stage = PIPELINE_STAGES[i];
      passedThrough[stage] = (passedThrough[stage] ?? 0) + 1;
    }

    if (isTerminal) {
      // Exited from the highest forward stage reached
      const exitStage = highestIdx >= 0 ? PIPELINE_STAGES[highestIdx] : "APPLIED";
      if (!exitedFrom[exitStage]) exitedFrom[exitStage] = {};
      exitedFrom[exitStage][app.status] = (exitedFrom[exitStage][app.status] ?? 0) + 1;
    }
  }

  // Build nodes — only include stages with at least 1 application
  const nodeMap = new Map<string, SankeyNode>();

  for (const stage of PIPELINE_STAGES) {
    const count = passedThrough[stage] ?? 0;
    if (count > 0) {
      nodeMap.set(stage, {
        id: stage,
        label: STAGE_LABELS[stage],
        color: STAGE_COLORS[stage],
        count,
      });
    }
  }

  for (const stage of TERMINAL_STAGES) {
    // Sum all exits to this terminal stage from any forward stage
    let terminalCount = 0;
    for (const exits of Object.values(exitedFrom)) {
      terminalCount += exits[stage] ?? 0;
    }
    if (terminalCount > 0) {
      nodeMap.set(stage, {
        id: stage,
        label: STAGE_LABELS[stage],
        color: STAGE_COLORS[stage],
        count: terminalCount,
      });
    }
  }

  // Build links
  const links: SankeyLink[] = [];

  // Forward flow: stage[i] → stage[i+1]
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = PIPELINE_STAGES[i];
    const to = PIPELINE_STAGES[i + 1];
    const fromCount = passedThrough[from] ?? 0;
    const toCount = passedThrough[to] ?? 0;
    if (fromCount > 0 && toCount > 0) {
      links.push({ source: from, target: to, value: toCount });
    }
  }

  // Exit links: forward stage → terminal stage
  for (const [fromStage, exits] of Object.entries(exitedFrom)) {
    for (const [terminalStage, count] of Object.entries(exits)) {
      if (count > 0 && nodeMap.has(fromStage) && nodeMap.has(terminalStage)) {
        links.push({ source: fromStage, target: terminalStage, value: count });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
    totalApplications: total,
  };
}

// ---------------------------------------------------------------------------
// Builder: demo data
// ---------------------------------------------------------------------------

/**
 * Realistic sample funnel for anonymous visitors.
 * Numbers represent a plausible 3-month job search.
 */
export function buildDemoSankeyData(): SankeyGraphData {
  const nodes: SankeyNode[] = [
    { id: "APPLIED", label: "Applied", color: STAGE_COLORS.APPLIED, count: 48 },
    { id: "REVIEWING", label: "Reviewing", color: STAGE_COLORS.REVIEWING, count: 31 },
    { id: "PHONE_SCREEN", label: "Screen", color: STAGE_COLORS.PHONE_SCREEN, count: 14 },
    { id: "INTERVIEWING", label: "Interview", color: STAGE_COLORS.INTERVIEWING, count: 7 },
    { id: "OFFER", label: "Offer", color: STAGE_COLORS.OFFER, count: 3 },
    { id: "REJECTED", label: "Rejected", color: STAGE_COLORS.REJECTED, count: 28 },
  ];

  const links: SankeyLink[] = [
    // Forward flow
    { source: "APPLIED", target: "REVIEWING", value: 31 },
    { source: "REVIEWING", target: "PHONE_SCREEN", value: 14 },
    { source: "PHONE_SCREEN", target: "INTERVIEWING", value: 7 },
    { source: "INTERVIEWING", target: "OFFER", value: 3 },
    // Rejection exits at each stage
    { source: "APPLIED", target: "REJECTED", value: 17 },
    { source: "REVIEWING", target: "REJECTED", value: 4 },
    { source: "PHONE_SCREEN", target: "REJECTED", value: 3 },
    { source: "INTERVIEWING", target: "REJECTED", value: 4 },
  ];

  return { nodes, links, totalApplications: 48 };
}

// ---------------------------------------------------------------------------
// Re-exports for component use
// ---------------------------------------------------------------------------

export { STAGE_COLORS, STAGE_LABELS, PIPELINE_STAGES, TERMINAL_STAGES };
