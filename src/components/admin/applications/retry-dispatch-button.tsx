"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"

interface Props {
  applicationId: string
  disabled?: boolean
  onSuccess?: () => void
  onError?: (message: string) => void
}

type ButtonState = "idle" | "confirm" | "loading" | "success"

export function RetryDispatchButton({ applicationId, disabled, onSuccess, onError }: Props) {
  const [state, setState] = useState<ButtonState>("idle")

  async function handleClick() {
    if (disabled) return

    if (state === "idle") {
      setState("confirm")
      return
    }

    if (state === "confirm") {
      setState("loading")
      try {
        const res = await fetch(`/api/admin/applications/${applicationId}/retry-dispatch`, {
          method: "POST",
        })
        const json = await res.json()
        if (json.success) {
          setState("success")
          onSuccess?.()
          // Reset after brief success state
          setTimeout(() => setState("idle"), 2000)
        } else {
          const message = json.error ?? "Retry failed"
          setState("idle")
          onError?.(message)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed"
        setState("idle")
        onError?.(message)
      }
    }
  }

  function handleBlur() {
    // Cancel confirm state if user clicks away
    if (state === "confirm") setState("idle")
  }

  if (disabled) {
    return (
      <span
        title="Already dispatched"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-600 cursor-not-allowed select-none"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry Dispatch
      </span>
    )
  }

  if (state === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-green-500/15 text-green-400 border border-green-500/30">
        Dispatched successfully
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      onBlur={handleBlur}
      disabled={state === "loading"}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
        state === "confirm"
          ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
          : "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25",
      ].join(" ")}
    >
      <RefreshCw className={["w-3.5 h-3.5", state === "loading" ? "animate-spin" : ""].join(" ")} />
      {state === "idle" && "Retry Dispatch"}
      {state === "confirm" && "Confirm Retry?"}
      {state === "loading" && "Retrying..."}
    </button>
  )
}
