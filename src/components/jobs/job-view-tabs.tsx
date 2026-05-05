"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Bookmark, Briefcase } from "lucide-react";

interface JobViewTabsProps {
  active: "all" | "saved";
  savedCount: number | null;
  isAuthenticated: boolean;
  onChange: (next: "all" | "saved") => void;
}

const BASE_PILL_CLASS =
  "inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-medium transition-all " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40";

const ACTIVE_CLASS =
  "bg-white text-zinc-900 shadow-[0_2px_12px_-2px_rgba(255,255,255,0.15)]";

const INACTIVE_CLASS =
  "text-zinc-400 hover:text-zinc-100";

const DISABLED_CLASS =
  "text-zinc-600 cursor-not-allowed";

/**
 * Two-segment view switch for the Browse Jobs surface: "All Jobs" / "Saved (N)".
 *
 * Saved is a viewing mode, not a filter — toggling it changes which set of
 * jobs you're browsing. All other filters (location, department, sort, etc.)
 * remain active and apply within the chosen set.
 *
 * Auth states:
 *   - Authenticated: both segments fully interactive. Saved shows the count.
 *   - Unauthenticated: Saved is rendered grayed out with a tooltip explaining
 *     the requirement. We keep it visible (not hidden) for discoverability —
 *     anonymous browsers learn the feature exists.
 */
export function JobViewTabs({
  active,
  savedCount,
  isAuthenticated,
  onChange,
}: JobViewTabsProps) {
  const savedLabel =
    savedCount !== null && savedCount >= 0
      ? `Saved (${savedCount.toLocaleString()})`
      : "Saved";

  return (
    <div
      role="tablist"
      aria-label="Job view"
      className="inline-flex items-center gap-1 p-1 rounded-full border border-white/10 bg-zinc-950/60 backdrop-blur"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "all"}
        onClick={() => onChange("all")}
        className={
          BASE_PILL_CLASS +
          " " +
          (active === "all" ? ACTIVE_CLASS : INACTIVE_CLASS)
        }
      >
        <Briefcase className="w-4 h-4" aria-hidden />
        All Jobs
      </button>

      {isAuthenticated ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === "saved"}
          onClick={() => onChange("saved")}
          className={
            BASE_PILL_CLASS +
            " " +
            (active === "saved" ? ACTIVE_CLASS : INACTIVE_CLASS)
          }
        >
          <Bookmark
            className={
              "w-4 h-4 " +
              (active === "saved" ? "fill-zinc-900" : "")
            }
            aria-hidden
          />
          {savedLabel}
        </button>
      ) : (
        <Tooltip.Provider delayDuration={150}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                role="tab"
                aria-selected={false}
                aria-disabled
                onClick={(e) => e.preventDefault()}
                className={BASE_PILL_CLASS + " " + DISABLED_CLASS}
              >
                <Bookmark className="w-4 h-4" aria-hidden />
                Saved
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="bottom"
                sideOffset={6}
                className="z-50 px-3 py-1.5 text-xs rounded-md bg-zinc-900 text-zinc-100 border border-white/10 shadow-lg animate-in fade-in zoom-in-95"
              >
                Sign in to save jobs
                <Tooltip.Arrow className="fill-zinc-900" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </div>
  );
}
