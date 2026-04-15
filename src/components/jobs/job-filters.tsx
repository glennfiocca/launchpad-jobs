"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Building2, Filter, X } from "lucide-react";
import type { JobFilters } from "@/types";

interface JobFiltersProps {
  filters: JobFilters;
  onChange: (f: JobFilters) => void;
}

export function JobFilters({ filters, onChange }: JobFiltersProps) {
  const [query, setQuery] = useState(filters.query ?? "");
  const [location, setLocation] = useState(filters.location ?? "");
  const [department, setDepartment] = useState(filters.department ?? "");
  const [company, setCompany] = useState(filters.company ?? "");
  const [remote, setRemote] = useState(filters.remote ?? false);
  const [showMore, setShowMore] = useState(false);
  const [employmentType, setEmploymentType] = useState(filters.employmentType ?? "");

  /** Avoid firing onChange on mount-only debounce (would clear /jobs?job= deep links in JobBoard). */
  const skipInitialDebounce = useRef(true);

  // Debounced apply
  useEffect(() => {
    const timer = setTimeout(() => {
      if (skipInitialDebounce.current) {
        skipInitialDebounce.current = false;
        return;
      }
      onChange({
        query: query || undefined,
        location: location || undefined,
        department: department || undefined,
        company: company || undefined,
        remote: remote || undefined,
        employmentType: employmentType || undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, location, department, company, remote, employmentType]);

  const hasFilters = !!(query || location || department || company || remote || employmentType);

  const clearAll = () => {
    setQuery(""); setLocation(""); setDepartment("");
    setCompany(""); setRemote(false); setEmploymentType("");
  };

  const inputClass =
    "w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-xl p-4 mb-4 space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
        <input
          type="text"
          placeholder="Job title, keyword, company..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Location */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Company */}
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Toggle more filters */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <Filter className="w-3.5 h-3.5" />
          {showMore ? "Less filters" : "More filters"}
        </button>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-white border-white/20"
            />
            <span className="text-sm text-zinc-400">Remote only</span>
          </label>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition-colors underline"
            >
              <X className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>
      </div>

      {showMore && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/8">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Department
            </label>
            <input
              type="text"
              placeholder="Engineering, Sales..."
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
              Employment Type
            </label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
            >
              <option value="">Any</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
