/**
 * Counts recent recruiter-driven status updates across applications.
 *
 * "Recent" = within last N days (default 7).
 * "Recruiter-driven" = triggeredBy !== "user" — these are status changes
 *   originating from recruiter emails, auto-apply confirmations, or system
 *   classifications that the user may not have noticed.
 *
 * Used by the dashboard eyebrow chip — a consolidated "where are we at"
 * signal that replaces the previous (misleading) unanswered-questions count.
 */

interface StatusHistoryEntrySubset {
  createdAt: Date | string;
  triggeredBy: string | null;
}

interface ApplicationStatusSubset {
  statusHistory: StatusHistoryEntrySubset[];
}

const DEFAULT_WINDOW_DAYS = 7;

export function countRecentStatusUpdates(
  apps: ReadonlyArray<ApplicationStatusSubset>,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): number {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const app of apps) {
    for (const h of app.statusHistory) {
      if (h.triggeredBy === "user") continue;
      const t =
        typeof h.createdAt === "string"
          ? Date.parse(h.createdAt)
          : h.createdAt.getTime();
      if (Number.isFinite(t) && t >= cutoff) count += 1;
    }
  }
  return count;
}
