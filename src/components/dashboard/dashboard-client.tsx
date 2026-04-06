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
    <div className="flex gap-6">
      {/* Left: tab + list */}
      <div className={`flex-1 min-w-0 ${selected ? "hidden lg:flex lg:flex-col" : "flex flex-col"}`}>
        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
          {STATUS_TABS.map(({ key, label }) => {
            const count = key === "ALL" ? applications.length : (counts[key] ?? 0);
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === key
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === key ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No applications in this category
          </div>
        ) : (
          <div className="space-y-2">
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

      {/* Right: detail */}
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
