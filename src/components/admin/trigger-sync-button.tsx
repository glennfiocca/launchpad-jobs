"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

interface SyncLogPollResponse {
  success: boolean
  data?: {
    status: "RUNNING" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE"
    totalBoards: number
    boardsSynced: number
    boardsFailed: number
    totalAdded: number
    totalUpdated: number
    totalDeactivated: number
    durationMs: number | null
    errorSummary: string | null
  }
  error?: string
}

const POLL_INTERVAL_MS = 3_000
const TERMINAL_STATUSES = new Set(["SUCCESS", "PARTIAL_FAILURE", "FAILURE"])

export function TriggerSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // Clean up interval on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  function handleTerminalStatus(data: NonNullable<SyncLogPollResponse["data"]>) {
    stopPolling()
    setSyncing(false)

    if (data.status === "FAILURE") {
      setResult(`Sync failed: ${data.errorSummary ?? "Unknown error"}`)
    } else {
      const failedSuffix = data.boardsFailed > 0 ? ` (${data.boardsFailed} failed)` : ""
      setResult(`Synced ${data.boardsSynced}/${data.totalBoards} boards${failedSuffix}`)
    }

    router.refresh()
  }

  function startPolling(syncLogId: string) {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/sync/${syncLogId}`)
        const json: SyncLogPollResponse = await res.json()

        if (!json.success || !json.data) {
          stopPolling()
          setSyncing(false)
          setResult(`Poll error: ${json.error ?? "Unexpected response"}`)
          return
        }

        const { data } = json

        if (TERMINAL_STATUSES.has(data.status)) {
          handleTerminalStatus(data)
          return
        }

        // Still RUNNING — show progressive status
        if (data.totalBoards > 0) {
          const processed = data.boardsSynced + data.boardsFailed
          setResult(`Syncing... ${processed}/${data.totalBoards} boards processed`)
        } else {
          setResult("Syncing...")
        }
      } catch (error) {
        stopPolling()
        setSyncing(false)
        setResult(`Poll error: ${error instanceof Error ? error.message : "Request failed"}`)
      }
    }, POLL_INTERVAL_MS)
  }

  async function triggerSync() {
    if (!confirm("Trigger a full sync of all active boards now?")) return

    setSyncing(true)
    setResult(null)

    try {
      const res = await fetch("/api/admin/jobs/sync", { method: "POST" })
      const json = await res.json()

      if (res.status === 409) {
        setSyncing(false)
        setResult("A sync is already running — try again shortly")
        return
      }

      if (!json.success) {
        setSyncing(false)
        setResult(`Error: ${json.error ?? "Unknown error"}`)
        return
      }

      const syncLogId: string = json.data.syncLogId
      setResult(`Sync started... (syncLogId: ${syncLogId})`)
      startPolling(syncLogId)
    } catch (error) {
      setSyncing(false)
      setResult(`Error: ${error instanceof Error ? error.message : "Request failed"}`)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={triggerSync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={["w-4 h-4", syncing ? "animate-spin" : ""].join(" ")} />
        {syncing ? "Syncing..." : "Trigger Sync"}
      </button>
      {result && (
        <p className="text-xs text-zinc-400">{result}</p>
      )}
    </div>
  )
}
