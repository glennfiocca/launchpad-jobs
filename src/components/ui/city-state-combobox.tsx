"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MapPin, X } from "lucide-react";
import type { PlaceSuggestion } from "@/lib/validations/places";

interface CityStateComboboxProps {
  /** Display value shown in the input (e.g. "Austin, TX") */
  value: string;
  onSelect: (city: string, state: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  /** Input sizing — "sm" (default, filter bar) or "lg" (hero search) */
  size?: "sm" | "lg";
}

export function CityStateCombobox({
  value,
  onSelect,
  onClear,
  placeholder = "City, State",
  className,
  size = "sm",
}: CityStateComboboxProps) {
  const isLg = size === "lg";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync display when external value changes (e.g. clear)
  useEffect(() => {
    setInput(value);
  }, [value]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(q)}&mode=jobs`
      );
      const json = await res.json();
      if (json.success) {
        setSuggestions(json.data ?? []);
        setOpen(json.data?.length > 0);
      }
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = useCallback(
    (val: string) => {
      setInput(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    },
    [fetchSuggestions]
  );

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      setInput(suggestion.description);
      setOpen(false);
      setSuggestions([]);
      try {
        const res = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&mode=jobs`
        );
        const json = await res.json();
        if (json.success && json.data) {
          const city = json.data.city ?? "";
          const state = json.data.state ?? "";
          // Update display to canonical "City, ST"
          if (city && state) setInput(`${city}, ${state}`);
          onSelect(city, state);
        }
      } catch {
        // Details failed — try to parse city/state from description text
        const parts = suggestion.description.split(",").map((s: string) => s.trim());
        if (parts.length >= 2) onSelect(parts[0], parts[1]);
      }
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setInput("");
    setSuggestions([]);
    setOpen(false);
    onClear();
  }, [onClear]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const inputClass = isLg
    ? "w-full pl-11 pr-9 py-3.5 text-base rounded-xl border border-white/10 bg-black text-white " +
      "placeholder:text-zinc-500 transition-all duration-200 focus:outline-none " +
      "focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
    : "w-full pl-9 pr-8 py-2.5 text-sm rounded-xl border border-white/10 bg-black text-white " +
      "placeholder:text-zinc-600 transition-all duration-200 focus:outline-none " +
      "focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={`relative ${className ?? ""}`}>
        <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 ${isLg ? "w-5 h-5 text-zinc-500" : "w-4 h-4 text-zinc-600"}`} />
        <Popover.Trigger asChild>
          <input
            type="text"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
            autoComplete="off"
          />
        </Popover.Trigger>
        {input && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors z-10"
            aria-label="Clear location"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-[#111111] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-100"
          style={{ width: "var(--radix-popover-trigger-width)" }}
          sideOffset={4}
        >
          {loading && (
            <p className="px-4 py-3 text-sm text-zinc-500">Searching...</p>
          )}
          {!loading && suggestions.length === 0 && (
            <p className="px-4 py-3 text-sm text-zinc-500">No results</p>
          )}
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
            >
              <span className="text-white">{s.mainText}</span>
              {s.secondaryText && (
                <span className="text-zinc-500 ml-1.5">{s.secondaryText}</span>
              )}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
