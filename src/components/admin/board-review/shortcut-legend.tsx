"use client"

interface Shortcut {
  key: string
  label: string
}

interface ShortcutLegendProps {
  items: Shortcut[]
}

/**
 * Fixed footer legend for keyboard shortcuts. Rendered by each tab so the
 * shortcuts available change with the active card (e.g. "Validate" is
 * queue-irrelevant, "Approve" is miss-irrelevant in its pre-validate state).
 */
export function ShortcutLegend({ items }: ShortcutLegendProps) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-500 pt-2">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[10px]">
            {item.key}
          </kbd>
          {item.label}
        </span>
      ))}
    </div>
  )
}
