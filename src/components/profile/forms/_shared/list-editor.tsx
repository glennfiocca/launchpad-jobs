"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { SavedPill } from "./atoms";
import { addRowBtnClass } from "./styles";

// Generic list editor for the profile child-resources (work history, projects,
// skills, certifications, languages, education entries).
//
// Reordering is keyboard-activated up/down arrow buttons — we deliberately
// avoid pulling in a drag-and-drop library; the lists are short (~5-15 rows)
// and the keyboard buttons are simpler & a11y-friendlier.
//
// PR1 Direction A enhancements:
//   - Row entry fly-in (pp-fade-up) gated on useReducedMotion.
//   - Just-reordered rows briefly flash the lavender pp-reorder-flash.
//   - The "Saved" pill in the row header uses the new editorial atom.
//   - Add-row CTA uses the lavender dashed treatment.
// Blur-to-save contract is UNCHANGED. No Save buttons on rows.

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
    update: (patch: Partial<T>) => void,
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
  /** Id of the row created most recently — plays the fly-in animation. */
  lastCreatedId?: string | null;
  /** Ids of rows that just reordered — plays the lavender flash. */
  recentlyReorderedIds?: Set<string>;
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
  lastCreatedId,
  recentlyReorderedIds,
}: ListEditorProps<T>) {
  const reduced = useReducedMotion();
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
    const focusable = row.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(
      'input[type="text"], input:not([type]), input[type="url"], input[type="email"], input[type="number"], input[type="search"], textarea',
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
    // `flex flex-col h-full` lets parents in a paired-section grid pin the
    // Add button to the bottom of the card (so paired Add buttons align even
    // when header heights differ). On single-column tabs the wrapper has no
    // explicit height, so `h-full` is a no-op and layout is unchanged.
    <div className="flex flex-col h-full">
      <div className="space-y-3 flex-1">
        {items.length === 0 && emptyState ? (
          <div className="text-sm text-text-dim">{emptyState}</div>
        ) : null}

        {items.map((item, index) => {
          const isJustAdded = item.id === lastCreatedId;
          const isJustReordered =
            recentlyReorderedIds?.has(item.id) ?? false;
          // Inline animation tokens — gated on reduced-motion so the page
          // resolves to the post-animation state when the user opts out.
          const animStyle =
            !reduced && isJustAdded
              ? { animation: "pp-fade-up 360ms cubic-bezier(0.22,1,0.36,1)" }
              : !reduced && isJustReordered
              ? { animation: "pp-reorder-flash 1200ms ease-out" }
              : undefined;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3"
              style={animStyle}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-dim">
                  <span>
                    {itemLabel ? itemLabel(item, index) : `Entry ${index + 1}`}
                  </span>
                  {recentlySavedIds?.has(item.id) && <SavedPill />}
                </span>
                <div className="flex items-center gap-1">
                  {onReorder && (
                    <>
                      <button
                        type="button"
                        onClick={() => onReorder(index, index - 1)}
                        disabled={busy || index === 0}
                        aria-label="Move up"
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onReorder(index, index + 1)}
                        disabled={busy || index === items.length - 1}
                        aria-label="Move down"
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
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

              {renderItem(item, index, (patch) =>
                onItemUpdate(index, patch),
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className={addRowBtnClass}
        >
          + {addLabel}
        </button>
      </div>
    </div>
  );
}
