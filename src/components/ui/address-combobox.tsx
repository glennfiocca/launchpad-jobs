"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MapPin } from "lucide-react";
import type { PlaceSuggestion, PlaceDetails } from "@/lib/validations/places";

interface AddressComboboxProps {
  value: string;
  onChange: (display: string) => void;
  onSelect: (details: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
}

let sessionTokenExpiry = 0;
let currentSessionToken = "";

/** Returns a session token, rotating every 3 minutes per Google billing guidelines. */
function getSessionToken(): string {
  const now = Date.now();
  if (now > sessionTokenExpiry || !currentSessionToken) {
    currentSessionToken = crypto.randomUUID();
    sessionTokenExpiry = now + 3 * 60 * 1000;
  }
  return currentSessionToken;
}

/** Reset session token after a completed place selection (billing session ends). */
function resetSessionToken() {
  currentSessionToken = "";
  sessionTokenExpiry = 0;
}

export function AddressCombobox({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing your address...",
  className,
}: AddressComboboxProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const token = getSessionToken();
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(q)}&mode=profile&sessionToken=${token}`
      );
      const json = await res.json();
      if (json.success) {
        setSuggestions(json.data ?? []);
        setOpen(json.data?.length > 0);
      }
    } catch {
      // Silently ignore — combobox shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = useCallback(
    (val: string) => {
      onChange(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    },
    [onChange, fetchSuggestions]
  );

  const handleSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      onChange(suggestion.description);
      setOpen(false);
      setSuggestions([]);
      const token = currentSessionToken;
      resetSessionToken();
      try {
        const res = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&mode=profile&sessionToken=${token}`
        );
        const json = await res.json();
        if (json.success && json.data) {
          onSelect(json.data as PlaceDetails);
        }
      } catch {
        // Details fetch failed — caller keeps display text only
      }
    },
    [onChange, onSelect]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const inputClass =
    "bg-black border border-white/10 text-white rounded-xl pl-9 pr-4 py-2.5 w-full text-sm " +
    "placeholder:text-zinc-700 transition-all duration-200 focus:outline-none " +
    "focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 " +
    "focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={`relative ${className ?? ""}`}>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none z-10" />
        <Popover.Trigger asChild>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
            autoComplete="off"
          />
        </Popover.Trigger>
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
                // Prevent blur on input before click fires
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
