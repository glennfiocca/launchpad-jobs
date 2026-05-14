"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResponse, TodayStats } from "@/types";

const POLL_INTERVAL_MS = 15_000;
const COUNT_UP_DURATION_MS = 800;
const FALLBACK_BASELINE = 1284;

/**
 * Polls /api/stats/today every 15s and returns a smoothly-animated count
 * that tweens between successive targets via requestAnimationFrame.
 *
 * Used by the editorial hero's "Live · N applications today" eyebrow chip
 * and other live-volume callouts.
 */
export function useTodayCount(initial?: number): number {
  const [target, setTarget] = useState<number>(initial ?? FALLBACK_BASELINE);
  const [display, setDisplay] = useState<number>(initial ?? FALLBACK_BASELINE);
  const rafRef = useRef<number | null>(null);

  // Poll the live count. Silently swallows network errors so a transient
  // outage doesn't reset the visible value — the previous target sticks.
  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/stats/today", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as ApiResponse<TodayStats>;
        if (!cancelled && json.success && json.data) {
          setTarget(json.data.displayCount);
        }
      } catch {
        // network errors are silent — keep last value
      }
    };

    void fetchOnce();
    const id = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Smooth cubic-eased count-up animation when `target` changes.
  // `display` intentionally omitted from the dep array — it's the tween's
  // own state and including it would restart the animation every frame.
  useEffect(() => {
    if (display === target) return;
    const start = display;
    const delta = target - start;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / COUNT_UP_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}
