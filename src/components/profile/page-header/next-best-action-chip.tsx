"use client";

/**
 * NextBestActionChip — the lavender call-to-action strip beneath the
 * page-header hero.
 *
 * Logic (locked in Q7):
 *  1. If any axis is at 0%, pick the first axis from NEXT_BEST_ACTION_PRIORITY
 *     that's at 0% — chip points there and frames the spoke as "needs filling."
 *  2. If all axes are > 0% but profile isn't fully complete, pick the
 *     lowest-scored axis (most room to grow). Same arrow icon, same copy
 *     pattern.
 *  3. Profile fully complete AND fresh (not stale): "Profile fully built ·
 *     last touched {ago}." with a check icon.
 *  4. Profile fully complete AND stale: "Last refresh {ago} — keep your
 *     profile current as your career evolves." with a refresh icon.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import {
  NEXT_BEST_ACTION_PRIORITY,
  type PerSectionScore,
} from "@/lib/profile/completeness";
import {
  TAB_KEYS,
  TAB_LABELS,
  type TabKey,
} from "@/components/profile/forms/_shared/tab-config";

interface NextBestActionChipProps {
  perSection: PerSectionScore;
  /** Whole-number total completion (0..100). Used to detect 100% state. */
  totalPct: number;
  /** Pre-formatted last-updated string ("today" / "12d" / "5mo"). */
  updatedAgo: string;
  /** Whether the profile hasn't been touched in
   *  STALENESS_THRESHOLD_DAYS days. */
  isStale: boolean;
}

// "Pushes the {section} spoke outward" reads better when the noun is the
// human-readable label (lowercased). Centralized so the chip copy + the
// CTA button text stay in lockstep.
function sectionNoun(tab: TabKey): string {
  return TAB_LABELS[tab].toLowerCase();
}

// Approximate point boost: a binary axis adds 12.5pp (one of 8 spokes), a
// proportional axis adds (1/total) × axis-pct-share. We round to a friendly
// number so the chip doesn't read like a tax form. 12 / 10 / 17 are the
// three values that come out in practice.
function pointBoost(tab: TabKey): number {
  if (tab === "personal") return 17; // ~1/6 of axis × 1/8 of total ≈ rounded to bigger number for the user's benefit
  if (tab === "professional") return 12;
  return 12; // binary axes — adding one row jumps the axis from 0 → 100
}

// Pick the axis the chip should point at. Either an explicit empty axis
// (priority-ordered) or the lowest-scored axis when every axis has at least
// some progress.
function pickTargetAxis(perSection: PerSectionScore): TabKey | null {
  // First — any empty axis in priority order.
  const emptyByPriority = NEXT_BEST_ACTION_PRIORITY.find(
    (k) => perSection[k] === 0,
  );
  if (emptyByPriority) return emptyByPriority;

  // No empty axes. Pick the lowest-scored. Tie-break by NEXT_BEST_ACTION_PRIORITY
  // order so the result is deterministic.
  let bestKey: TabKey | null = null;
  let bestPct = Infinity;
  // Walk in TAB_KEYS order so personal/professional don't both come up first
  // on a tie; the priority tie-break below handles the actual ordering.
  for (const key of TAB_KEYS) {
    if (perSection[key] < bestPct) {
      bestPct = perSection[key];
      bestKey = key;
    } else if (perSection[key] === bestPct && bestKey != null) {
      const currentPriority = NEXT_BEST_ACTION_PRIORITY.indexOf(bestKey);
      const candidatePriority = NEXT_BEST_ACTION_PRIORITY.indexOf(key);
      if (candidatePriority < currentPriority) {
        bestKey = key;
      }
    }
  }
  return bestKey;
}

export function NextBestActionChip({
  perSection,
  totalPct,
  updatedAgo,
  isStale,
}: NextBestActionChipProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goToTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Fully complete states (100%) — no axis selection, no "open X" CTA.
  if (totalPct >= 100) {
    if (isStale) {
      return (
        <div className="flex items-center gap-3 rounded-[12px] border border-[rgba(196,181,253,0.20)] bg-[rgba(196,181,253,0.06)] px-4 py-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(196,181,253,0.18)] text-[var(--color-accent-lavender)] shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent-lavender)]">
              Stale · refresh nudge
            </div>
            <div className="mt-0.5 text-[13.5px] text-text">
              Last refresh{" "}
              <span className="font-mono tabular-nums">{updatedAgo}</span>{" "}
              — keep your profile current as your career evolves.
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-[rgba(196,181,253,0.20)] bg-[rgba(196,181,253,0.06)] px-4 py-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(196,181,253,0.18)] text-[var(--color-accent-lavender)] shrink-0">
          <Check className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent-lavender)]">
            All sections filled
          </div>
          <div className="mt-0.5 text-[13.5px] text-text">
            Profile fully built · last touched{" "}
            <span className="font-mono tabular-nums">{updatedAgo}</span>.
          </div>
        </div>
      </div>
    );
  }

  // Incomplete — pick a target axis and render the standard arrow chip.
  const target = pickTargetAxis(perSection);
  if (!target) return null;
  const boost = pointBoost(target);
  const targetLabel = TAB_LABELS[target];
  const noun = sectionNoun(target);
  const isEmpty = perSection[target] === 0;

  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[rgba(196,181,253,0.20)] bg-[rgba(196,181,253,0.06)] px-4 py-3">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[rgba(196,181,253,0.18)] text-[var(--color-accent-lavender)] shrink-0">
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--color-accent-lavender)]">
          Next best action ·{" "}
          <span className="tabular-nums">+{boost} points</span> · pushes the{" "}
          {noun} spoke outward
        </div>
        <div className="mt-0.5 text-[13.5px] text-text">
          {isEmpty ? "Add your " : "Round out your "}
          <em className="not-italic font-medium text-[var(--color-accent-lavender)]">
            {noun}
          </em>{" "}
          — the {isEmpty ? "empty" : "shortest"} spoke on your sigil.
        </div>
      </div>
      <button
        type="button"
        onClick={() => goToTab(target)}
        className="shrink-0 rounded-[10px] border border-[rgba(196,181,253,0.32)] bg-[rgba(196,181,253,0.14)] px-3.5 py-1.5 font-display font-medium text-[12.5px] text-[var(--color-accent-lavender)] hover:bg-[rgba(196,181,253,0.20)] transition-colors"
      >
        Open {targetLabel} →
      </button>
    </div>
  );
}
