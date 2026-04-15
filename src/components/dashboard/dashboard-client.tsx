"use client";

import { useState, useRef, useEffect } from "react";
import type { ApplicationWithJob } from "@/types";
import { ApplicationCard } from "./application-card";
import { ApplicationDetail } from "./application-detail";
import { STATUS_CONFIG } from "@/types";
import type { ApplicationStatus } from "@prisma/client";

interface DashboardClientProps {
  initialApplications: ApplicationWithJob[];
}

type TabKey = ApplicationStatus | "ALL" | "CLOSED";

const STATUS_TABS: Array<{ key: TabKey; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "APPLIED", label: "Applied" },
  { key: "REVIEWING", label: "Reviewing" },
  { key: "PHONE_SCREEN", label: "Phone Screen" },
  { key: "INTERVIEWING", label: "Interviewing" },
  { key: "OFFER", label: "Offer" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CLOSED", label: "Closed" },
];

// Active tab color styles keyed by TabKey (ALL uses neutral).
const TAB_ACTIVE_STYLES: Partial<Record<TabKey, string>> = {
  APPLIED:      "bg-blue-500/10 text-blue-400",
  REVIEWING:    "bg-amber-500/10 text-amber-400",
  PHONE_SCREEN: "bg-purple-500/10 text-purple-400",
  INTERVIEWING: "bg-orange-500/10 text-orange-400",
  OFFER:        "bg-emerald-500/10 text-emerald-400",
  REJECTED:     "bg-red-500/10 text-red-400",
  CLOSED:       "bg-zinc-800 text-zinc-400",
};

export function DashboardClient({ initialApplications }: DashboardClientProps) {
  const [applications, setApplications] = useState(initialApplications);
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const [selected, setSelected] = useState<ApplicationWithJob | null>(null);

  const filtered =
    activeTab === "ALL"
      ? applications
      : activeTab === "CLOSED"
        ? applications.filter((a) => a.status === "WITHDRAWN" || a.status === "LISTING_REMOVED")
        : applications.filter((a) => a.status === activeTab);

  const counts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const closedCount = (counts["WITHDRAWN"] ?? 0) + (counts["LISTING_REMOVED"] ?? 0);

  function getTabCount(key: TabKey): number {
    if (key === "ALL") return applications.length;
    if (key === "CLOSED") return closedCount;
    return counts[key] ?? 0;
  }

  function handleApplicationUpdate(updated: ApplicationWithJob) {
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
    setSelected(updated);
  }

  const detailScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detailScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [selected?.id]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Full-width tab bar */}
      <div className="bg-[#0a0a0a] border border-white/8 rounded-xl">
        <div className="flex items-center gap-1 px-3 py-2.5 overflow-x-auto">
          {STATUS_TABS.map(({ key, label }) => {
            const count = getTabCount(key);
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors lg:flex-1 lg:justify-center ${
                  activeTab === key
                    ? (TAB_ACTIVE_STYLES[key] ?? "bg-white/10 text-white")
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="bg-white/8 text-zinc-400 text-xs rounded-full px-1.5 py-0.5">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-column content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: application list */}
        <div className={`flex-1 min-h-0 bg-[#0a0a0a] border border-white/8 rounded-xl overflow-y-auto overscroll-contain ${selected ? "hidden lg:block" : "block"}`}>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-600 text-sm">
              No applications in this category
            </div>
          ) : (
            filtered.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                selected={selected?.id === app.id}
                onClick={() => setSelected(app)}
              />
            ))
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div ref={detailScrollRef} className="w-full lg:w-[520px] shrink-0 overflow-y-auto overscroll-contain">
            <ApplicationDetail
              application={selected}
              onClose={() => setSelected(null)}
              onApplicationUpdate={handleApplicationUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
