/**
 * Forward-stage palette for the cockpit's non-SVG surfaces (filter chips,
 * legend cells, timeline dots). The PipelineSankey component already has its
 * own internal STAGE_PALETTE for SVG fills — this mirror is for consumers
 * that need the same hex/label tuple outside an `<svg>`.
 *
 * Kept in sync with --color-stage-* tokens in globals.css. When a token
 * changes there, mirror it here.
 */

import type { ApplicationStatus } from "@prisma/client";

export interface StageTokens {
  readonly label: string;
  readonly color: string;
  readonly accent: string;
}

/** Forward-only pipeline stages in canonical order. */
export const FORWARD_STAGES: ReadonlyArray<ApplicationStatus> = [
  "APPLIED",
  "REVIEWING",
  "PHONE_SCREEN",
  "INTERVIEWING",
  "OFFER",
] as const;

export const STAGE_TOKENS: Readonly<Record<ApplicationStatus, StageTokens>> = {
  APPLIED:         { label: "Applied",      color: "#6366f1", accent: "#818cf8" },
  REVIEWING:       { label: "Reviewing",    color: "#8b5cf6", accent: "#a78bfa" },
  PHONE_SCREEN:    { label: "Phone Screen", color: "#a855f7", accent: "#c084fc" },
  INTERVIEWING:    { label: "Interview",    color: "#d946ef", accent: "#e879f9" },
  OFFER:           { label: "Offer",        color: "#22d3ee", accent: "#67e8f9" },
  REJECTED:        { label: "Rejected",     color: "#71717a", accent: "#a1a1aa" },
  WITHDRAWN:       { label: "Withdrawn",    color: "#71717a", accent: "#a1a1aa" },
  LISTING_REMOVED: { label: "Removed",      color: "#71717a", accent: "#a1a1aa" },
};

/** Look up a stage's label, falling back to the raw status string. */
export function stageLabel(status: ApplicationStatus): string {
  return STAGE_TOKENS[status]?.label ?? status;
}

/** Look up a stage's color, falling back to neutral zinc. */
export function stageColor(status: ApplicationStatus): string {
  return STAGE_TOKENS[status]?.color ?? "#52525b";
}
