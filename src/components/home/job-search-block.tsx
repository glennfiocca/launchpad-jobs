"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { CityStateCombobox } from "@/components/ui/city-state-combobox";
import Link from "next/link";

export function JobSearchBlock() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [locationDisplay, setLocationDisplay] = useState("");

  const handleLocationSelect = useCallback((c: string, s: string) => {
    setCity(c);
    setState(s);
    setLocationDisplay(c && s ? `${c}, ${s}` : c || s);
  }, []);

  const handleLocationClear = useCallback(() => {
    setCity("");
    setState("");
    setLocationDisplay("");
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      if (city) params.set("city", city);
      if (state) params.set("state", state);
      const qs = params.toString();
      router.push(qs ? `/jobs?${qs}` : "/jobs");
    },
    [query, city, state, router],
  );

  return (
    <section
      role="search"
      aria-label="Search jobs"
      className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-16"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col md:flex-row gap-3">
          {/* Keyword input */}
          <div className="relative flex-1">
            <label htmlFor="hero-search-query" className="sr-only">
              Job title or keyword
            </label>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 pointer-events-none" />
            <input
              id="hero-search-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Job title or keyword"
              autoComplete="off"
              className="w-full pl-11 pr-4 py-3.5 text-base rounded-xl border border-white/10 bg-black text-white placeholder:text-zinc-500 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Location */}
          <div className="md:w-64">
            <CityStateCombobox
              value={locationDisplay}
              onSelect={handleLocationSelect}
              onClear={handleLocationClear}
              placeholder="City, State"
              size="lg"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full md:w-auto px-8 py-3.5 rounded-xl bg-white text-black font-semibold text-base hover:bg-white/90 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Secondary action */}
      <div className="text-center mt-4">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors"
        >
          Browse all jobs
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}
