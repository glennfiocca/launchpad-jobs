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

const STATUS_TABS: Array<{ key: ApplicationStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "APPLIED", label: "Applied" },
  { key: "REVIEWING", label: "Reviewing" },
  { key: "PHONE_SCREEN", label: "Phone Screen" },
  { key: "INTERVIEWING", label: "Interviewing" },
  { key: "OFFER", label: "Offer" },
  { key: "REJECTED", label: "Rejected" },
];

export function DashboardClient({ initialApplications }: DashboardClientProps) {
  const [applications] = useState(initialApplications);
  const [activeTab, setActiveTab] = useState<ApplicationStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<ApplicationWithJob | null>(null);

  const filtered = activeTab === "ALL"
    ? applications
    : applications.filter((a) => a.status === activeTab);

  const counts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-black flex gap-4">
      {/* Left panel: status tabs + application list */}
      <div className={`flex-1 min-w-0 bg-[#0a0a0a] border border-white/8 rounded-xl overflow-hidden flex flex-col ${selected ? "hidden lg:flex" : "flex"}`}>
        {/* Status filter pills */}
        <div className="flex items-center gap-1 p-3 overflow-x-auto border-b border-white/5">
          {STATUS_TABS.map(({ key, label }) => {
            const count = key === "ALL" ? applications.length : (counts[key] ?? 0);
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="bg-white/8 text-zinc-400 text-xs rounded-full px-1.5 py-0.5 ml-1">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Application list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600 text-sm">
            No applications in this category
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
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

      {/* Right panel: detail */}
      {selected && (
        <div className="w-full lg:w-[520px] shrink-0">
          <ApplicationDetail
            application={selected}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
