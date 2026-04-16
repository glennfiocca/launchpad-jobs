"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { AdminApplicationDetail } from "@/types"

interface Props {
  emails: AdminApplicationDetail["emails"]
}

const DIRECTION_STYLES: Record<string, string> = {
  INBOUND: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  OUTBOUND: "bg-green-500/15 text-green-300 border border-green-500/30",
}

function AiBlock({
  classification,
  confidence,
  reasoning,
}: {
  classification: string | null
  confidence: number | null
  reasoning: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  if (!classification && !confidence && !reasoning) return null

  return (
    <div className="mt-3 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-violet-400">AI Classification</span>
        {classification && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-violet-500/15 text-violet-300 border border-violet-500/30 font-medium">
            {classification}
          </span>
        )}
        {confidence !== null && (
          <span className="text-xs text-zinc-400">{Math.round(confidence * 100)}% confidence</span>
        )}
        {reasoning && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Reasoning
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
      {expanded && reasoning && (
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{reasoning}</p>
      )}
    </div>
  )
}

export function EmailThreadViewer({ emails }: Props) {
  if (emails.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">No emails on record for this application.</p>
    )
  }

  return (
    <div className="space-y-4">
      {emails.map((email) => {
        const dirStyle =
          DIRECTION_STYLES[email.direction] ?? DIRECTION_STYLES["INBOUND"]

        return (
          <div
            key={email.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
          >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={[
                    "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
                    dirStyle,
                  ].join(" ")}
                >
                  {email.direction}
                </span>
                <span className="text-sm font-medium text-white">{email.subject || "(no subject)"}</span>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(email.sentAt).toLocaleString()}
              </span>
            </div>

            <div className="text-xs text-zinc-400 space-y-0.5 mb-3">
              <p>
                <span className="text-zinc-600">From:</span> {email.fromEmail}
              </p>
              <p>
                <span className="text-zinc-600">To:</span> {email.toEmail}
              </p>
            </div>

            {/* Body */}
            <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans leading-relaxed">
              {email.body || "(empty body)"}
            </pre>

            {/* AI block */}
            <AiBlock
              classification={email.aiClassification}
              confidence={email.aiConfidence}
              reasoning={email.aiReasoning}
            />
          </div>
        )
      })}
    </div>
  )
}
