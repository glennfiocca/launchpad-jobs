"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Generic list editor for the profile child-resources (work history, projects,
// skills, certifications, languages, education entries).
//
// Reordering is handled with up/down arrow buttons — we deliberately avoid
// pulling in a drag-and-drop library; the lists are short (~5-15 rows) and
// the keyboard-accessible buttons are simpler & a11y-friendlier.
//
// `renderItem` receives an `update` patcher so individual rows don't need to
// reach back into the parent's state. Parents typically pass a closure that
// calls `useChildResource.update`.

export interface ListEditorProps<T extends { id: string }> {
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  /**
   * Optional reorder callback — when omitted, up/down arrows are hidden.
   * Indexes refer to positions in the current `items` array.
   */
  onReorder?: (oldIndex: number, newIndex: number) => void;
  renderItem: (
    item: T,
    index: number,
    update: (patch: Partial<T>) => void
  ) => ReactNode;
  /**
   * Required because `renderItem` can't update without it. Parents
   * typically pass `(idx, patch) => update(items[idx].id, patch)`.
   */
  onItemUpdate: (index: number, patch: Partial<T>) => void;
  emptyState?: ReactNode;
  addLabel?: string;
  /** Optional collapse-header label (currently displayed as a row title above each row). */
  itemLabel?: (item: T, index: number) => string;
  /** Disable mutating buttons while a network operation is in flight. */
  busy?: boolean;
  /**
   * Optional id of a row that should be scrolled into view and have its
   * first focusable input auto-selected. Cleared by the consumer after
   * the effect fires.
   */
  autoFocusItemId?: string | null;
  /** Called once after the auto-focus effect has run, so the consumer can clear it. */
  onAutoFocusConsumed?: () => void;
  /** Ids whose last save succeeded recently — renders a transient "Saved" pill. */
  recentlySavedIds?: Set<string>;
}

export function ListEditor<T extends { id: string }>({
  items,
  onAdd,
  onRemove,
  onReorder,
  renderItem,
  onItemUpdate,
  emptyState,
  addLabel = "Add",
  itemLabel,
  busy,
  autoFocusItemId,
  onAutoFocusConsumed,
  recentlySavedIds,
}: ListEditorProps<T>) {
  // Refs to each row container, keyed by item id. Used to scroll the
  // newly-added row into view and focus + select its first input.
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Layout effect (not regular effect) so the focus/select runs after the
  // row mounts in the same commit cycle — avoids setTimeout hacks.
  useLayoutEffect(() => {
    if (!autoFocusItemId) return;
    const row = rowRefs.current.get(autoFocusItemId);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    // Find the first text-like input inside the row. <select> and
    // checkboxes are skipped since they can't be select()ed.
    const focusable = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input:not([type]), input[type="url"], input[type="email"], input[type="number"], input[type="search"], textarea'
    );
    if (focusable) {
      focusable.focus();
      // `select()` works on both <input> and <textarea>.
      try {
        focusable.select();
      } catch {
        // Some input types (e.g. number) reject select() in older browsers — safely ignore.
      }
    }
    onAutoFocusConsumed?.();
  }, [autoFocusItemId, onAutoFocusConsumed]);

  return (
    <div className="space-y-3">
      {items.length === 0 && emptyState ? (
        <div className="text-sm text-zinc-500">{emptyState}</div>
      ) : null}

      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) rowRefs.current.set(item.id, el);
            else rowRefs.current.delete(item.id);
          }}
          className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
              <span>{itemLabel ? itemLabel(item, index) : `Entry ${index + 1}`}</span>
              {recentlySavedIds?.has(item.id) && (
                <span
                  className="text-xs text-emerald-400 normal-case tracking-normal transition-opacity"
                  aria-live="polite"
                >
                  Saved
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {onReorder && (
                <>
                  <button
                    type="button"
                    onClick={() => onReorder(index, index - 1)}
                    disabled={busy || index === 0}
                    aria-label="Move up"
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onReorder(index, index + 1)}
                    disabled={busy || index === items.length - 1}
                    aria-label="Move down"
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={busy}
                aria-label="Remove entry"
                className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>
          </div>

          {renderItem(item, index, (patch) => onItemUpdate(index, patch))}
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="w-full rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-zinc-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
      >
        + {addLabel}
      </button>
    </div>
  );
}
