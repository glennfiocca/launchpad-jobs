/**
 * Sankey diagram data model and builder functions.
 *
 * Transforms application data (live or demo) into a graph of
 * nodes (pipeline stages) and links (transition flows) that
 * the manifold renderer lays out.
 *
 * Closure semantics (see fix/sankey-closure-semantics):
 *   An application is considered "closed" — and contributes to a drop-off
 *   between two stages — only when EITHER:
 *     (a) `application.status === "REJECTED"` (company-side rejection), OR
 *     (b) `application.job.isActive === false` (the underlying job was
 *         removed from the source board during sync).
 *
 *   Applications currently sitting at APPLIED, REVIEWING, PHONE_SCREEN,
 *   INTERVIEWING, or OFFER (with an active job) are still in flight —
 *   they appear in their current stage's `count`, NOT in a drop-off.
 *
 *   `WITHDRAWN` is user-initiated (the user pulled out). It is neither
 *   "closed by company" nor "job removed" and is excluded from the
 *   manifold visualization entirely. We may want to surface withdrawn
 *   applications separately in a future iteration.
 */

import type { ApplicationStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SankeyNode {
  id: string;
  label: string;
  color: string;
  /** Count of applications currently in flight at this stage. */
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
  /**
   * Per forward-stage count of applications that *closed* at that stage —
   * either REJECTED (status) or via `job.isActive === false` (job removed
   * from the source board). Keyed by `ApplicationStatus` for the five
   * forward stages: APPLIED, REVIEWING, PHONE_SCREEN, INTERVIEWING, OFFER.
   *
   * The renderer uses this to size and label the gray drop-off shapes
   * between adjacent stages. Stages with zero closures render no shape.
   */
  closedAtStage: Record<string, number>;
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
 *
 * Returns APPLIED as the default floor — every application starts there,
 * so an entry that never recorded history is still attributed to APPLIED.
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

  if (maxIdx >= 0) return PIPELINE_STAGES[maxIdx];

  // Current status is terminal and no forward history exists — attribute
  // to APPLIED, the implicit entry point for every application.
  return "APPLIED";
}

// ---------------------------------------------------------------------------
// Builder: live data
// ---------------------------------------------------------------------------

/**
 * Structural subset of Application + Job required by the manifold builder.
 * `job.isActive: false` means the underlying job was removed from the
 * source board (LISTING_REMOVED-ish but tracked via the Job table).
 */
export interface SankeyApplicationInput {
  status: ApplicationStatus;
  statusHistory: ReadonlyArray<{
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
  }>;
  job: { isActive: boolean };
}

function emptyClosedAtStage(): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) acc[stage] = 0;
  return acc;
}

/**
 * Build manifold graph data from a user's real applications.
 *
 * Bucketing rules:
 *   - WITHDRAWN: skipped entirely (neither in-flight nor a closure). May
 *     be surfaced separately in a future iteration.
 *   - REJECTED or `job.isActive === false`: counted as a CLOSURE at the
 *     highest forward stage the application reached.
 *   - Otherwise: counted as IN FLIGHT at the application's current stage.
 *
 * Stage counts represent in-flight applications at that exact stage.
 * Drop-off counts (closedAtStage) attribute each closure to a stage
 * the application had reached before it closed.
 */
export function buildSankeyFromApplications(
  applications: ReadonlyArray<SankeyApplicationInput>,
): SankeyGraphData {
  const total = applications.length;
  if (total === 0) {
    // Even with no applications, emit a node for every forward stage so
    // downstream renderers (legend cells, manifold markers) always have
    // the full 5-stage shape to draw — counts are simply zero.
    return {
      nodes: PIPELINE_STAGES.map((stage) => ({
        id: stage,
        label: STAGE_LABELS[stage],
        color: STAGE_COLORS[stage],
        count: 0,
      })),
      links: [],
      totalApplications: 0,
      closedAtStage: emptyClosedAtStage(),
    };
  }

  // In-flight count per forward stage (current status, active job, not closed).
  const inflightAt: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) inflightAt[stage] = 0;

  // Closures attributed to each forward stage (REJECTED + job-removed).
  const closedAtStage = emptyClosedAtStage();

  // Closure breakdown by terminal-stage label — kept around so the existing
  // terminal-node emission (REJECTED node, etc.) still has counts to display.
  const closedByTerminal: Record<string, Record<string, number>> = {};

  for (const app of applications) {
    // WITHDRAWN — user-initiated exit. Skipped from the manifold; may be
    // surfaced separately in the future (e.g. a small badge near the legend).
    if (app.status === "WITHDRAWN") continue;

    const jobInactive = app.job.isActive === false;
    const isRejected = app.status === "REJECTED";
    const isInflightStage = PIPELINE_STAGES.includes(app.status);

    if (isRejected || jobInactive) {
      // Closure — attribute to the highest forward stage reached.
      const exitStage = highestForwardStage(app.status, app.statusHistory);
      closedAtStage[exitStage] = (closedAtStage[exitStage] ?? 0) + 1;

      // Bucket by terminal "kind" so the optional terminal node retains a count.
      // job-removed closures share the REJECTED swatch in the manifold; the
      // LISTING_REMOVED enum value remains reserved for explicit status migrations.
      const terminalKey: ApplicationStatus = isRejected ? "REJECTED" : "LISTING_REMOVED";
      if (!closedByTerminal[exitStage]) closedByTerminal[exitStage] = {};
      closedByTerminal[exitStage][terminalKey] =
        (closedByTerminal[exitStage][terminalKey] ?? 0) + 1;
      continue;
    }

    if (isInflightStage) {
      // In-flight — count at the application's CURRENT stage.
      inflightAt[app.status] = (inflightAt[app.status] ?? 0) + 1;
    }
    // Anything else (e.g. a status outside the forward set that isn't
    // a closure or WITHDRAWN) is intentionally skipped — defensive default.
  }

  // Build forward-stage nodes — always emit every forward stage so the
  // homepage manifold + legend can render all 5 cells consistently.
  const nodeMap = new Map<string, SankeyNode>();

  for (const stage of PIPELINE_STAGES) {
    nodeMap.set(stage, {
      id: stage,
      label: STAGE_LABELS[stage],
      color: STAGE_COLORS[stage],
      count: inflightAt[stage] ?? 0,
    });
  }

  // Terminal nodes — conditional on having any closure attributed to them.
  for (const terminal of TERMINAL_STAGES) {
    let count = 0;
    for (const exits of Object.values(closedByTerminal)) {
      count += exits[terminal] ?? 0;
    }
    if (count > 0) {
      nodeMap.set(terminal, {
        id: terminal,
        label: STAGE_LABELS[terminal],
        color: STAGE_COLORS[terminal],
        count,
      });
    }
  }

  // Build links — forward flow + closure exits.
  const links: SankeyLink[] = [];

  // Forward flow: stage[i] → stage[i+1] uses the destination's in-flight count.
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
    const from = PIPELINE_STAGES[i];
    const to = PIPELINE_STAGES[i + 1];
    const fromCount = inflightAt[from] ?? 0;
    const toCount = inflightAt[to] ?? 0;
    if (fromCount > 0 && toCount > 0) {
      links.push({ source: from, target: to, value: toCount });
    }
  }

  // Closure exits: forward stage → terminal stage.
  for (const [fromStage, exits] of Object.entries(closedByTerminal)) {
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
    closedAtStage,
  };
}

// ---------------------------------------------------------------------------
// Builder: demo data
// ---------------------------------------------------------------------------

/**
 * Realistic sample funnel for anonymous visitors.
 * Numbers represent a plausible 3-month job search.
 *
 * Stage counts here are "currently in flight at this stage" (matching the
 * live-data semantics), and closedAtStage carries the per-stage drop-offs
 * that the manifold renders as gray exit shapes.
 */
export function buildDemoSankeyData(): SankeyGraphData {
  const nodes: SankeyNode[] = [
    { id: "APPLIED", label: "Applied", color: STAGE_COLORS.APPLIED, count: 17 },
    { id: "REVIEWING", label: "Reviewing", color: STAGE_COLORS.REVIEWING, count: 14 },
    { id: "PHONE_SCREEN", label: "Screen", color: STAGE_COLORS.PHONE_SCREEN, count: 7 },
    { id: "INTERVIEWING", label: "Interview", color: STAGE_COLORS.INTERVIEWING, count: 3 },
    { id: "OFFER", label: "Offer", color: STAGE_COLORS.OFFER, count: 3 },
    { id: "REJECTED", label: "Rejected", color: STAGE_COLORS.REJECTED, count: 28 },
  ];

  const links: SankeyLink[] = [
    // Forward flow (in-flight stage → in-flight stage)
    { source: "APPLIED", target: "REVIEWING", value: 14 },
    { source: "REVIEWING", target: "PHONE_SCREEN", value: 7 },
    { source: "PHONE_SCREEN", target: "INTERVIEWING", value: 3 },
    { source: "INTERVIEWING", target: "OFFER", value: 3 },
    // Rejection exits at each stage
    { source: "APPLIED", target: "REJECTED", value: 17 },
    { source: "REVIEWING", target: "REJECTED", value: 4 },
    { source: "PHONE_SCREEN", target: "REJECTED", value: 3 },
    { source: "INTERVIEWING", target: "REJECTED", value: 4 },
  ];

  return {
    nodes,
    links,
    totalApplications: 48,
    closedAtStage: {
      APPLIED: 17,
      REVIEWING: 4,
      PHONE_SCREEN: 3,
      INTERVIEWING: 4,
      OFFER: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Re-exports for component use
// ---------------------------------------------------------------------------

export { STAGE_COLORS, STAGE_LABELS, PIPELINE_STAGES, TERMINAL_STAGES };
