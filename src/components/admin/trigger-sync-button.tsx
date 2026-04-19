"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"

export function TriggerSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function triggerSync() {
    if (!confirm("Trigger a full sync of all active boards now? This may take 30–60 seconds.")) return
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/jobs/sync", { method: "POST" })
      const json = await res.json()
      if (json.success) {
        setResult(`Synced ${json.data.boardsSynced}/${json.data.totalBoards} boards (${json.data.boardsFailed} failed)`)
        router.refresh()
      } else if (res.status === 409) {
        setResult("A sync is already running — try again shortly")
      } else {
        setResult(`Error: ${json.error ?? "Unknown error"}`)
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : "Request failed"}`)
    } finally {
      setSyncing(false)
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
