/** Shared indigo-accented input class for all text inputs, selects, and textareas */
export const INPUT_CLASS =
  "bg-black border border-white/10 text-white rounded-xl px-4 py-2.5 w-full text-sm placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";

/** Input class with left padding for icon prefix */
export const INPUT_CLASS_WITH_ICON =
  "bg-black border border-white/10 text-white rounded-xl pl-9 pr-4 py-2.5 w-full text-sm placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";

export const STATUS_BADGE_STYLES: Record<
  string,
  { badge: string; dot: string; pulse: boolean }
> = {
  blue: {
    badge: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
    dot: "bg-blue-400",
    pulse: false,
  },
  yellow: {
    badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    dot: "bg-amber-400",
    pulse: true,
  },
  purple: {
    badge: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
    dot: "bg-purple-400",
    pulse: true,
  },
  orange: {
    badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    dot: "bg-orange-400",
    pulse: true,
  },
  green: {
    badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    dot: "bg-emerald-400",
    pulse: false,
  },
  red: {
    badge: "bg-red-500/15 text-red-300 border border-red-500/30",
    dot: "bg-red-400",
    pulse: false,
  },
  gray: {
    badge: "bg-zinc-800 text-zinc-400 border border-zinc-700",
    dot: "bg-zinc-500",
    pulse: false,
  },
};

/**
 * Human-readable labels for `ApplicationStatusHistory.triggeredBy` values.
 * The dashboard cockpit journey timeline shows "via {label}" beneath each
 * status step — kept in one place so we don't sprinkle string mappings
 * across components.
 *
 * Keys here mirror the values written by:
 *   - src/lib/greenhouse/auto-apply.ts → "pipeline_auto_apply"
 *   - src/lib/ai.ts (email classifier) → "recruiter_email"
 *   - user-initiated mutations → "user"
 *   - greenhouse polling job → "greenhouse_poll"
 *   - admin operator queue → "operator"
 *   - default fallback in Prisma → "system"
 */
export const TRIGGER_LABELS: Record<string, string> = {
  pipeline_auto_apply: "Pipeline auto-apply",
  recruiter_email: "Recruiter email",
  user: "You",
  greenhouse_poll: "Greenhouse poll",
  operator: "Operator",
  system: "System",
};

/**
 * Resolve a `triggeredBy` string to a human-readable label. Falls back to
 * the underscore-stripped raw value so any new triggeredBy values added
 * later render reasonably without a code change.
 */
export function triggerLabel(triggeredBy: string | null | undefined): string {
  if (!triggeredBy) return "Unknown";
  return TRIGGER_LABELS[triggeredBy] ?? triggeredBy.replace(/_/g, " ");
}
