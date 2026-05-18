/**
 * Pure derivations for the cockpit's hero region. Pulled out of
 * DashboardClient so the orchestrator file stays under its line budget
 * and these counters are individually testable.
 */

import type { ApplicationStatus } from "@prisma/client";
import type { ApplicationWithDashboardData } from "@/types";

/** Empty record with every status zeroed — keeps count lookups branch-free. */
export function zeroCounts(): Record<ApplicationStatus, number> {
  return {
    APPLIED: 0,
    REVIEWING: 0,
    PHONE_SCREEN: 0,
    INTERVIEWING: 0,
    OFFER: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
    LISTING_REMOVED: 0,
  };
}

/**
 * Count applications that have *reached* each forward stage. Mirrors the
 * filter semantics ("has the app ever been at this stage?") so the legend
 * cells and the active filter agree on a single funnel definition.
 */
export function deriveStageCounts(
  apps: ReadonlyArray<ApplicationWithDashboardData>,
): Record<ApplicationStatus, number> {
  const counts = zeroCounts();
  for (const app of apps) {
    const seen = new Set<ApplicationStatus>();
    seen.add(app.status);
    for (const h of app.statusHistory) {
      seen.add(h.toStatus);
      if (h.fromStatus) seen.add(h.fromStatus);
    }
    for (const stage of seen) {
      counts[stage] += 1;
    }
  }
  return counts;
}

export interface HeroMetrics {
  readonly thisWeek: number;
  readonly responseRate: number;
  readonly avgReplyDays: number | null;
}

/**
 * Compute the three hero metrics from raw applications, client-side.
 * - thisWeek: applied in the last 7 days
 * - responseRate: % of apps with at least one inbound email
 * - avgReplyDays: mean days between appliedAt -> first inbound email
 */
export function deriveHeroMetrics(
  apps: ReadonlyArray<ApplicationWithDashboardData>,
): HeroMetrics {
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  let thisWeek = 0;
  let withInbound = 0;
  const replyGaps: number[] = [];

  for (const app of apps) {
    if (now - new Date(app.appliedAt).getTime() <= WEEK_MS) thisWeek += 1;
    const inbound = app.emails.find((e) => e.direction === "inbound");
    if (inbound) {
      withInbound += 1;
      const gap =
        new Date(inbound.receivedAt).getTime() -
        new Date(app.appliedAt).getTime();
      if (gap > 0) replyGaps.push(gap / DAY_MS);
    }
  }

  const responseRate =
    apps.length > 0 ? (withInbound / apps.length) * 100 : 0;
  const avgReplyDays =
    replyGaps.length > 0
      ? replyGaps.reduce((a, b) => a + b, 0) / replyGaps.length
      : null;

  return { thisWeek, responseRate, avgReplyDays };
}
