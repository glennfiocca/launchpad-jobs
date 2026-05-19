"use client"

import { useState } from "react"
import { QueueTab } from "./queue-tab"
import { MissesTab } from "./misses-tab"
import { HistoryTab } from "./history-tab"

type TabKey = "queue" | "misses" | "history"

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "queue", label: "Queue" },
  { key: "misses", label: "Misses" },
  { key: "history", label: "History" },
]

/**
 * Client root for /admin/board-review. Owns only the active-tab state;
 * each tab is fully self-contained (own fetch, own keyboard handler, own
 * scratch state) so switching tabs is a clean unmount/mount cycle that
 * also resets keyboard handlers — no chance of A/R/N firing on the
 * wrong card.
 */
export function BoardReviewRoot() {
  const [active, setActive] = useState<TabKey>("queue")

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === tab.key
                ? "border-violet-500 text-white"
                : "border-transparent text-zinc-400 hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "queue" && <QueueTab />}
      {active === "misses" && <MissesTab />}
      {active === "history" && <HistoryTab />}
    </div>
  )
}
