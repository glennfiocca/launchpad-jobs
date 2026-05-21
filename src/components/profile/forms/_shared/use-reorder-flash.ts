"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FLASH_MS = 1200;

/**
 * Manages a transient Set<string> of "recently reordered" item ids that the
 * ListEditor / SpineTimeline consumes to render the lavender flash animation.
 *
 * Call `flash(id)` after an optimistic reorder; the id self-clears after
 * FLASH_MS. Call `flashPair(a, b)` for the common swap pattern.
 */
export function useReorderFlash() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clear = useCallback((id: string) => {
    setIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const flash = useCallback(
    (id: string) => {
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      setIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const t = setTimeout(() => clear(id), FLASH_MS);
      timersRef.current.set(id, t);
    },
    [clear]
  );

  const flashPair = useCallback(
    (a: string, b: string) => {
      flash(a);
      flash(b);
    },
    [flash]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return { reorderFlashIds: ids, flash, flashPair };
}
