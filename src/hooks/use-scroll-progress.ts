"use client";

import { useEffect, useState } from "react";

/**
 * Returns a `0..1` value mapping `window.scrollY` from `start` -> `end` to
 * `0` -> `1`. Values outside the range clamp to the bounds.
 *
 * Listens via a passive scroll handler + a single rAF tick per scroll event,
 * so updates are cheap even on long pages. The dashboard cockpit uses this
 * to drive the sticky compact strip's fade-in across `120..340` px.
 */
export function useScrollProgress(start: number, end: number): number {
  const [t, setT] = useState<number>(0);

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const y = window.scrollY;
      const p = Math.min(1, Math.max(0, (y - start) / (end - start)));
      setT(p);
      raf = 0;
    };
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    // Prime on mount so SSR -> CSR transition has the right value already.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [start, end]);

  return t;
}
