"use client";

/**
 * StatusPill — pulsing-on-active status badge for application rows.
 * Reuses STATUS_BADGE_STYLES from src/lib/styles.ts so the look stays in
 * sync with every other badge surface in the app.
 */

import type { ApplicationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import { STATUS_BADGE_STYLES } from "@/lib/styles";

interface StatusPillProps {
  status: ApplicationStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const cfg = STATUS_CONFIG[status];
  const style = STATUS_BADGE_STYLES[cfg.color] ?? STATUS_BADGE_STYLES.gray;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full shrink-0 font-medium",
        style.badge,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          style.dot,
          style.pulse && "animate-status-pulse",
        )}
      />
      {cfg.label}
    </span>
  );
}
