"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { CityStateCombobox } from "@/components/ui/city-state-combobox";

// Editorial restyle (W3): grid + dark elev surface + indigo shadow. All
// query/filter logic is preserved untouched from the previous revision.
export function JobSearchBlock() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [locationDisplay, setLocationDisplay] = useState("");
  const [freeLocationText, setFreeLocationText] = useState("");

  const handleLocationSelect = useCallback((c: string, s: string) => {
    setCity(c);
    setState(s);
    setFreeLocationText("");
    setLocationDisplay(c && s ? `${c}, ${s}` : c || s);
  }, []);

  const handleLocationFreeText = useCallback((text: string) => {
    setFreeLocationText(text);
    setCity("");
    setState("");
  }, []);

  const handleLocationClear = useCallback(() => {
    setCity("");
    setState("");
    setFreeLocationText("");
    setLocationDisplay("");
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      if (city) {
        params.set("city", city);
        if (state) params.set("state", state);
      } else if (freeLocationText) {
        // User typed location text without selecting a suggestion — use legacy filter
        params.set("location", freeLocationText);
      }
      const qs = params.toString();
      router.push(qs ? `/jobs?${qs}` : "/jobs");
    },
    [query, city, state, freeLocationText, router],
  );

  return (
    <form
      role="search"
      aria-label="Search jobs"
      onSubmit={handleSubmit}
      className="w-full max-w-[780px] mx-auto grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 p-2 rounded-[14px] bg-bg-elev border border-[rgba(245,244,241,0.1)] text-left"
      style={{ boxShadow: "0 20px 60px -20px rgba(99,102,241,0.4)" }}
    >
      {/* Keyword field */}
      <div
        className="flex items-center gap-2.5 px-4 py-[13px] rounded-[10px] border border-transparent bg-black/30 transition-colors focus-within:border-[rgba(129,140,248,0.5)] min-w-0"
      >
        <label htmlFor="hero-search-query" className="sr-only">
          Job title or keyword
        </label>
        <Search
          className="w-4 h-4 text-text-dim flex-none"
          aria-hidden="true"
        />
        <input
          id="hero-search-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Job title or keyword"
          autoComplete="off"
          className="flex-1 min-w-0 w-full bg-transparent border-0 outline-none text-text text-[15px] placeholder:text-text-dim"
        />
      </div>

      {/* Location field — CityStateCombobox brings its own styling, wrapped
          so its rounded edges align with the editorial card */}
      <div className="min-w-0">
        <CityStateCombobox
          value={locationDisplay}
          onSelect={handleLocationSelect}
          onFreeText={handleLocationFreeText}
          onClear={handleLocationClear}
          placeholder="City, state, or remote"
          size="lg"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 px-6 py-[13px] rounded-[10px] bg-[#f5f4f1] text-[#0a0a0b] font-semibold text-[14.5px] hover:bg-white hover:-translate-y-px transition-all duration-200"
      >
        Search
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
