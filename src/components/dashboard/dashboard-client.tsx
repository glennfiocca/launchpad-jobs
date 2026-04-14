"use client";

import { useState } from "react";
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

  return (
    <div className="flex flex-col gap-3">
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
                    ? "bg-white/10 text-white"
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
      <div className="flex gap-4">
        {/* Left: application list */}
        <div className={`flex-1 min-w-0 bg-[#0a0a0a] border border-white/8 rounded-xl overflow-hidden flex flex-col ${selected ? "hidden lg:flex" : "flex"}`}>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-600 text-sm">
              No applications in this category
            </div>
          ) : (
            <div className="overflow-y-auto">
              {filtered.map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={app}
                  selected={selected?.id === app.id}
                  onClick={() => setSelected(app)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="w-full lg:w-[520px] shrink-0">
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
