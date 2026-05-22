"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitProfilePatch } from "./submit";

// Debounce window for tail-end save coalescing. 500ms feels snappy in practice:
// a user typing then tabbing to the next field sees the SAVED pill flash about
// half a second after they stop, which reads as "the system noticed."
const DEFAULT_DELAY_MS = 500;

// How long the SAVED pill stays visible after a successful save. Matched to
// the list-editor's pill TTL so all profile surfaces feel uniform.
const SAVED_PILL_VISIBLE_MS = 2000;

export interface UseDebouncedProfileSaveResult {
  /** Schedule a save — fires DEFAULT_DELAY_MS after the LAST call. Idempotent. */
  schedule: () => void;
  /** Fire any pending save immediately. Awaitable for unmount / explicit flush. */
  flush: () => Promise<void>;
  /** True while a save request is in flight. Drives a "Saving…" eyebrow. */
  saving: boolean;
  /** True for SAVED_PILL_VISIBLE_MS after a successful save. Drives the SavedPill. */
  recentlySaved: boolean;
}

/**
 * Debounced PUT /api/profile from any scalar tab (Personal / Professional /
 * Preferences).
 *
 * Call `schedule()` from every field's `onBlur` (text/textarea) or `onChange`
 * (chip inputs, pill toggles, tri-state radios, selects, checkboxes — fields
 * that don't have a meaningful blur). The hook coalesces rapid changes into
 * a single PUT that fires `DEFAULT_DELAY_MS` after activity stops.
 *
 * `buildPayload` is captured via a ref so the hook is stable across renders —
 * the caller doesn't have to memoize it. Each scheduled save reads the
 * latest closed-over form state when the timer fires.
 *
 * On unmount, any pending save is best-effort flushed via fire-and-forget so
 * a user navigating away within the debounce window doesn't lose changes.
 */
export function useDebouncedProfileSave(
  buildPayload: () => unknown,
  delayMs: number = DEFAULT_DELAY_MS,
): UseDebouncedProfileSaveResult {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState(false);

  const buildPayloadRef = useRef(buildPayload);
  // React 19's strict-refs rule forbids mutating refs during render; we
  // update the captured callback in an effect so flush() always reads the
  // latest closure when its timer fires.
  useEffect(() => {
    buildPayloadRef.current = buildPayload;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSaving(true);
    const result = await submitProfilePatch(buildPayloadRef.current());
    setSaving(false);
    if (result.ok) {
      setRecentlySaved(true);
      if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
      pillTimerRef.current = setTimeout(
        () => setRecentlySaved(false),
        SAVED_PILL_VISIBLE_MS,
      );
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to save profile");
    }
  }, [router]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, delayMs);
  }, [flush, delayMs]);

  // Best-effort flush on unmount. Fires the PUT but does not await — the
  // component is going away. The user may not see a failure toast in this
  // path, which is acceptable for "navigating away mid-edit" semantics.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void submitProfilePatch(buildPayloadRef.current());
      }
      if (pillTimerRef.current) {
        clearTimeout(pillTimerRef.current);
      }
    };
  }, []);

  return { schedule, flush, saving, recentlySaved };
}
