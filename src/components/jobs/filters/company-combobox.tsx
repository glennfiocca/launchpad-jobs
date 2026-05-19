"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-select company combobox — typeahead picker for the Browse Jobs
 * filter card.
 *
 * Visual spec follows the design's `DropdownField` aesthetic: 36px tall
 * trigger, 10px radius, mono uppercase `COMPANY` label, lavender-tinted
 * border whenever ≥1 company is selected.
 *
 * Value model is an array of company **names** (not ids). Names match what
 * the chip strip displays and what the URL serializes — keeping the value
 * space bookmarkable.
 */

interface CompanyComboboxProps {
  /** Currently selected company names. */
  value: string[];
  /** Facet rows from the listing API — `{ value: name, count }`. */
  options: Array<{ value: string; count: number }>;
  /** Called with the next selected names array on every toggle. */
  onChange: (next: string[]) => void;
  className?: string;
}

const TRIGGER_BASE =
  "flex items-center gap-2 h-9 px-3 rounded-[10px] bg-bg text-left " +
  "transition-colors duration-150 focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent-lavender/40";

const TRIGGER_IDLE = "border border-border text-text-dim";
const TRIGGER_ACTIVE = "border border-accent-lavender/30 text-text";

const POPOVER_CLASS =
  "z-50 w-[280px] overflow-hidden rounded-[12px] bg-bg-elev " +
  "border border-accent-lavender/25 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7),0_0_0_4px_rgba(196,181,253,0.06)]";

export function CompanyCombobox({
  value,
  options,
  onChange,
  className,
}: CompanyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input each time the popover opens so the user
  // can start typing immediately. Radix mounts content asynchronously, so
  // defer one frame before focusing.
  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Reset the search filter as the popover transitions from open → closed.
  // Derived state pattern (React docs: "Storing information from previous
  // renders") avoids the setState-in-effect lint and the extra render that
  // comes with synchronizing two sources of truth via useEffect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setQuery("");
  }

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, query]);

  const triggerLabel = useMemo(() => {
    if (value.length === 0) return "Any";
    if (value.length === 1) return value[0];
    return `${value[0]} +${value.length - 1}`;
  }, [value]);

  const toggle = useCallback(
    (name: string) => {
      const next = selectedSet.has(name)
        ? value.filter((v) => v !== name)
        : [...value, name];
      onChange(next);
    },
    [onChange, selectedSet, value]
  );

  const clear = useCallback(() => onChange([]), [onChange]);

  const hasSelection = value.length > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            TRIGGER_BASE,
            hasSelection ? TRIGGER_ACTIVE : TRIGGER_IDLE,
            className
          )}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim shrink-0">
            COMPANY
          </span>
          <span
            className={cn(
              "flex-1 min-w-0 truncate text-[13px]",
              hasSelection ? "text-text" : "text-text-dim"
            )}
          >
            {triggerLabel}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={POPOVER_CLASS}
          // Custom focus management — we focus the search input via the
          // open-effect above, not the first child.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search */}
          <div className="relative border-b border-border px-2.5 py-2.5">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies…"
              aria-label="Search companies"
              className={cn(
                "w-full h-[30px] pl-7 pr-2 text-[12.5px] rounded-[7px]",
                "bg-bg text-text placeholder:text-text-dim",
                "border border-border focus:outline-none focus:border-accent-lavender/40"
              )}
            />
          </div>

          {/* List */}
          <div
            role="listbox"
            aria-multiselectable
            className="max-h-[240px] overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3.5 text-center text-[12px] text-text-dim">
                No companies match &ldquo;{query}&rdquo;
              </p>
            ) : (
              filtered.map((opt) => {
                const isSelected = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[7px] text-left transition-colors duration-150",
                      isSelected
                        ? "bg-accent-lavender/10"
                        : "hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex-1 text-[12.5px] truncate",
                        isSelected
                          ? "text-accent-lavender font-medium"
                          : "text-text"
                      )}
                    >
                      {opt.value}
                    </span>
                    <span className="font-mono text-[10.5px] text-text-dim shrink-0">
                      {opt.count.toLocaleString()}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid place-items-center w-4 h-4 rounded-[4px] shrink-0",
                        isSelected
                          ? "bg-accent-lavender border border-accent-lavender"
                          : "border border-border-strong"
                      )}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-bg" />}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer — only with active selection */}
          {hasSelection && (
            <div className="flex items-center gap-2.5 border-t border-border bg-accent-lavender/[0.04] px-2.5 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-accent-lavender">
                {value.length} SELECTED
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={clear}
                className="text-[11.5px] font-medium text-text-muted hover:text-text transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
