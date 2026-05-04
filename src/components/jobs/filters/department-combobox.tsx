"use client";

import { useState, useMemo, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  "w-full flex items-center justify-between gap-2 pl-3 pr-2 py-2.5 text-sm " +
  "rounded-xl border border-white/10 bg-black text-left transition-all duration-200 " +
  "focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20";

export function DepartmentCombobox({
  value,
  onChange,
  options,
  className,
}: DepartmentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

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

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      // Prevent the trigger from opening when clicking the clear affordance.
      e.preventDefault();
      e.stopPropagation();
      onChange(undefined);
    },
    [onChange]
  );

  const triggerLabel = selected
    ? `${selected.value} (${selected.count.toLocaleString()})`
    : "All departments";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            TRIGGER_BASE,
            selected ? "text-white" : "text-zinc-500",
            className
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <span className="flex items-center gap-1 shrink-0">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear department"
                onMouseDown={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange(undefined);
                  }
                }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          className="w-[280px] max-h-[320px] overflow-hidden bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 z-50 flex flex-col animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-100"
        >
          <div className="p-2 border-b border-white/8">
            <input
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="department-listbox"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search departments..."
              className="w-full px-2 py-1.5 text-sm rounded-md bg-black border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <div
            id="department-listbox"
            role="listbox"
            className="overflow-y-auto flex-1"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-zinc-500">No matches</p>
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
                      "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors",
                      "focus:outline-none focus:bg-white/5",
                      isActive
                        ? "bg-indigo-500/10 text-white"
                        : "text-zinc-300 hover:bg-white/5"
                    )}
                  >
                    <span className="truncate">{opt.value}</span>
                    <span className="text-zinc-500 shrink-0">
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
