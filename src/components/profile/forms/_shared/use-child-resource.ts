"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChildResourceSlug } from "./tab-config";

// Generic CRUD hook over the /api/profile/<slug> + /api/profile/<slug>/<id>
// endpoints. Optimistic updates with rollback on failure — the UI mutates
// `items` immediately, then reconciles with the server response (or rolls
// back). All updates are immutable spreads (per project coding-style).

interface ApiCollectionResponse<T> {
  data: T[];
}

interface ApiItemResponse<T> {
  data: T;
}

interface ApiErrorResponse {
  error?: string;
}

export interface ChildResource<T extends { id: string }> {
  items: T[];
  loading: boolean;
  error: string | null;
  /**
   * Id of the most recently created row, exposed so consumers can scroll
   * + focus the new entry. Cleared after the consumer calls `consumeLastCreatedId`.
   */
  lastCreatedId: string | null;
  consumeLastCreatedId: () => void;
  /**
   * Ids whose most recent PUT succeeded within the last ~2s. Used to
   * render a transient "Saved" pill in the row header.
   */
  recentlySavedIds: Set<string>;
  create: (input: Omit<T, "id">) => Promise<void>;
  update: (id: string, patch: Partial<Omit<T, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// How long each id stays in `recentlySavedIds` after a successful PUT.
const SAVED_PILL_MS = 2000;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorResponse;
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useChildResource<T extends { id: string }>(
  slug: ChildResourceSlug
): ChildResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [recentlySavedIds, setRecentlySavedIds] = useState<Set<string>>(
    () => new Set()
  );

  // Track if the component is still mounted to suppress stale state updates
  // — covers the case where a user changes tabs while a request is in flight.
  const mountedRef = useRef(true);
  // Per-id timeout handles for the "Saved" pill so a fast re-save resets
  // the countdown instead of stacking timers.
  const savedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      // Clear any pending pill timers on unmount.
      savedTimersRef.current.forEach((t) => clearTimeout(t));
      savedTimersRef.current.clear();
    };
  }, []);

  const consumeLastCreatedId = useCallback(() => {
    setLastCreatedId(null);
  }, []);

  const markSaved = useCallback((id: string) => {
    setRecentlySavedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const existing = savedTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setRecentlySavedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      savedTimersRef.current.delete(id);
    }, SAVED_PILL_MS);
    savedTimersRef.current.set(id, timer);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as ApiCollectionResponse<T>;
      if (mountedRef.current) setItems(body.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load data";
      if (mountedRef.current) setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: Omit<T, "id">) => {
      setError(null);
      try {
        const res = await fetch(`/api/profile/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error(await readError(res));
        const body = (await res.json()) as ApiItemResponse<T>;
        if (mountedRef.current) {
          setItems((prev) => [...prev, body.data]);
          setLastCreatedId(body.data.id);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create entry";
        if (mountedRef.current) setError(message);
        throw err;
      }
    },
    [slug]
  );

  const update = useCallback(
    async (id: string, patch: Partial<Omit<T, "id">>) => {
      setError(null);
      const previous = items;
      // Optimistic patch — merge in-place via immutable spread.
      const optimistic = items.map((it) =>
        it.id === id ? ({ ...it, ...patch } as T) : it
      );
      setItems(optimistic);

      try {
        const res = await fetch(`/api/profile/${slug}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await readError(res));
        const body = (await res.json()) as ApiItemResponse<T>;
        if (mountedRef.current) {
          // Reconcile with server's canonical row (e.g. server-set timestamps).
          setItems((prev) =>
            prev.map((it) => (it.id === id ? body.data : it))
          );
          markSaved(id);
        }
      } catch (err) {
        // Roll back to pre-mutation snapshot.
        if (mountedRef.current) setItems(previous);
        const message =
          err instanceof Error ? err.message : "Failed to update entry";
        if (mountedRef.current) setError(message);
        throw err;
      }
    },
    [items, slug, markSaved]
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      const previous = items;
      setItems((prev) => prev.filter((it) => it.id !== id));

      try {
        const res = await fetch(`/api/profile/${slug}/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await readError(res));
      } catch (err) {
        if (mountedRef.current) setItems(previous);
        const message =
          err instanceof Error ? err.message : "Failed to delete entry";
        if (mountedRef.current) setError(message);
        throw err;
      }
    },
    [items, slug]
  );

  return {
    items,
    loading,
    error,
    lastCreatedId,
    consumeLastCreatedId,
    recentlySavedIds,
    create,
    update,
    remove,
    refresh,
  };
}
