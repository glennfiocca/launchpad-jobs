"use client";

import { useState, useMemo, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single-select department dropdown. Trigger matches the Browse Jobs
 * redesign's `DropdownField` aesthetic — 36px tall, 10px radius, mono
 * uppercase TEAM label, lavender-tinted border when a value is selected.
 *
 * Popover internals (Radix-backed) are unchanged: search input + scrollable
 * facet list. The clear (×) sits inside the trigger.
 */

interface DepartmentOption {
  value: string;
  count: number;
}

interface DepartmentComboboxProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: DepartmentOption[];
  className?: string;
}

const TRIGGER_BASE =
  "flex items-center gap-2 h-9 px-3 rounded-[10px] bg-bg text-left " +
  "transition-colors duration-150 focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent-lavender/40";

const TRIGGER_IDLE = "border border-border text-text-dim";
const TRIGGER_ACTIVE = "border border-accent-lavender/30 text-text";

const POPOVER_CLASS =
  "z-50 w-[280px] max-h-[320px] overflow-hidden rounded-[12px] bg-bg-elev " +
  "border border-accent-lavender/25 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7),0_0_0_4px_rgba(196,181,253,0.06)] " +
  "flex flex-col";

export function DepartmentCombobox({
  value,
  onChange,
  options,
  className,
}: DepartmentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, query]);

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  // Inline clear — fires inside the trigger but must not toggle the popover.
  const handleClear = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(undefined);
    },
    [onChange]
  );

  const hasSelection = !!value;

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
            TEAM
          </span>
          <span
            className={cn(
              "flex-1 min-w-0 truncate text-[13px]",
              hasSelection ? "text-text" : "text-text-dim"
            )}
          >
            {value ?? "Any"}
          </span>
          {hasSelection && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear team"
              onMouseDown={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleClear(e);
                }
              }}
              className="text-text-dim hover:text-text transition-colors p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-accent-lavender/40"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className={POPOVER_CLASS}
        >
          <div className="p-2 border-b border-border">
            <input
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="department-listbox"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams…"
              className={cn(
                "w-full h-[30px] px-2 text-[12.5px] rounded-[7px]",
                "bg-bg text-text placeholder:text-text-dim",
                "border border-border focus:outline-none focus:border-accent-lavender/40"
              )}
            />
          </div>
          <div
            id="department-listbox"
            role="listbox"
            className="overflow-y-auto flex-1 p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-[12px] text-text-dim">No matches</p>
            ) : (
              filtered.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[7px] text-[12.5px] text-left transition-colors duration-150",
                      "focus:outline-none focus:bg-white/[0.04]",
                      isActive
                        ? "bg-accent-lavender/10 text-accent-lavender font-medium"
                        : "text-text hover:bg-white/[0.04]"
                    )}
                  >
                    <span className="truncate">{opt.value}</span>
                    <span className="font-mono text-[10.5px] text-text-dim shrink-0">
                      {opt.count.toLocaleString()}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
