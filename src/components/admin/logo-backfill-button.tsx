"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ImageIcon, Loader2, CheckCircle2 } from "lucide-react";

interface BackfillStatus {
  running: boolean;
  progress: { completed: number; total: number; current: string };
}

interface BackfillResult {
  enriched: number;
  failed: number;
  total: number;
  durationMs: number;
}

interface PollResponse {
  success: boolean;
  data?: {
    status: BackfillStatus | null;
    lastResult: BackfillResult | null;
  };
}

const POLL_INTERVAL_MS = 3_000;

export function LogoBackfillButton() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/logos");
      const json: PollResponse = await res.json();
      if (!json.success || !json.data) return;

      if (json.data.status?.running) {
        const p = json.data.status.progress;
        setProgress(
          p.total > 0
            ? `${p.completed}/${p.total} — ${p.current}`
            : p.current
        );
      } else {
        stopPolling();
        setRunning(false);
        setProgress(null);
        if (json.data.lastResult) {
          const r = json.data.lastResult;
          const secs = Math.round(r.durationMs / 1000);
          setResult(`${r.enriched} logos added, ${r.failed} skipped (${secs}s)`);
        }
      }
    } catch {
      // Retry on next poll
    }
  }, [stopPolling]);

  async function start() {
    setStarting(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();

      if (res.status === 409) {
        setResult("Backfill already running");
        setStarting(false);
        return;
      }

      if (!json.success) {
        setResult(json.error ?? "Failed to start");
        setStarting(false);
        return;
      }

      setRunning(true);
      setProgress("Starting...");
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Request failed");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={start}
        disabled={running || starting}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-700 hover:border-zinc-600 disabled:opacity-50 transition-colors"
      >
        {running || starting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ImageIcon className="w-4 h-4" />
        )}
        {running ? "Backfilling..." : starting ? "Starting..." : "Backfill Logos"}
      </button>
      {progress && (
        <span className="text-xs text-zinc-400">{progress}</span>
      )}
      {result && !running && (
        <span className="flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {result}
        </span>
      )}
    </div>
  );
}
