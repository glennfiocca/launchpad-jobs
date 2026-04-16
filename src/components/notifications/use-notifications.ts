"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Notification } from "@prisma/client";

const POLL_INTERVAL = 30_000; // 30 seconds

interface UseNotificationsReturn {
  count: number;
  items: Notification[];
  loading: boolean;
  panelLoading: boolean;
  nextCursor: string | null;
  refresh: () => void;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useNotifications(
  opts: { enabled?: boolean } = {}
): UseNotificationsReturn {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const countAbortRef = useRef<AbortController | null>(null);
  const pollingActiveRef = useRef(true);

  // Lightweight count poll — always active when hook is mounted
  const fetchCount = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    if (!pollingActiveRef.current) return;

    countAbortRef.current?.abort();
    countAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/notifications/count", {
        cache: "no-store",
        signal: countAbortRef.current.signal,
      });
      // Stop polling if unauthenticated — session likely expired
      if (res.status === 401) {
        pollingActiveRef.current = false;
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setCount(json.data?.count ?? 0);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Network error — silently ignore, will retry next interval
    }
  }, []);

  // Full list fetch — only when panel is opened
  const fetchList = useCallback(async (cursor?: string) => {
    listAbortRef.current?.abort();
    listAbortRef.current = new AbortController();

    const isFresh = !cursor;
    if (isFresh) setPanelLoading(true);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/notifications?${params.toString()}`, {
        signal: listAbortRef.current.signal,
        cache: "no-store",
      });

      if (!res.ok) return;
      const json = await res.json();

      if (isFresh) {
        setItems(json.data?.items ?? []);
      } else {
        setItems((prev) => [...prev, ...(json.data?.items ?? [])]);
      }

      setNextCursor(json.data?.nextCursor ?? null);
      setCount(json.data?.unreadCount ?? 0);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[notifications] fetch list failed", err);
    } finally {
      if (isFresh) setPanelLoading(false);
    }
  }, []);

  // Fetch + refresh list whenever panel opens
  useEffect(() => {
    if (opts.enabled) {
      fetchList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled]);

  // Poll count on interval + tab focus
  useEffect(() => {
    pollingActiveRef.current = true;
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL);

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      pollingActiveRef.current = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      countAbortRef.current?.abort();
      listAbortRef.current?.abort();
    };
  }, [fetchCount]);

  const refresh = useCallback(() => {
    fetchCount();
    fetchList();
  }, [fetchCount, fetchList]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoading(true);
    await fetchList(nextCursor);
    setLoading(false);
  }, [nextCursor, fetchList]);

  const markRead = useCallback(async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date() } : n
        )
      );
      setCount((c) => Math.max(0, c - 1));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const res = await fetch("/api/notifications/mark-all-read", {
      method: "PATCH",
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date() }))
      );
      setCount(0);
    }
  }, []);

  // Uses functional updater to read current items without capturing stale closure
  const remove = useCallback(async (id: string) => {
    let wasUnread = false;
    setItems((prev) => {
      wasUnread = prev.find((n) => n.id === id)?.isRead === false;
      return prev;
    });

    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setCount((c) => Math.max(0, c - 1));
    }
  }, []);

  return {
    count,
    items,
    loading,
    panelLoading,
    nextCursor,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    remove,
  };
}
