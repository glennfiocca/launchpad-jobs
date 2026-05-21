"use client";

/**
 * EducationHistoryForm — Direction A "Manifold" treatment.
 *
 * Education entries live on a vertical lavender spine (mirroring the work-
 * history pattern documented in direction-a.jsx). Each entry is anchored
 * to a dot on the spine, ordered by graduation year (most recent first).
 *
 *  - Lavender vertical guide line on the left.
 *  - Per-row dot color: cyan for the most-recent / in-progress entry,
 *    lavender for older entries. Empty `endYear` is treated as "in progress".
 *  - Headline reads: Degree · field-of-study above the university name,
 *    with start–end years pinned to the spine in mono / tabular-nums.
 *  - Inline UniversityCombobox sits in the row's editing block; blur-to-save
 *    is preserved on every field via the per-row `patch` callback.
 *  - Hover bleeds a faint lavender gradient out from the spine.
 *  - "Add education" CTA at the foot of the spine, using the dashed lavender
 *    addRowBtnClass shared with work-history / skills / projects.
 *  - Saved pill flashes in the section header for ~2s after any successful
 *    PUT, in addition to the per-row pill driven by recentlySavedIds.
 *
 * Data shape is unchanged — same EducationEntryInput contract, same
 * UniversityCombobox + free-text fallback. Layout/typography is the only
 * thing that moved. List-editor is bypassed because the spine wants full
 * control over row chrome (dot placement, hover bleed, reorder buttons
 * inline with the header).
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import type { EducationEntryInput } from "@/types";
import { UniversityCombobox } from "@/components/ui/university-combobox";
import type { EducationEntryUniversitySummary } from "@/app/api/profile/education-entries/_include";
import {
  addRowBtnClass,
  directionAInputClass,
  directionASectionClass,
  gridTwoCol,
  labelClass,
} from "./_shared/styles";
import {
  FormEyebrow,
  SavedPill,
  SectionHeader,
} from "./_shared/atoms";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// API rows carry the joined University summary (see _include.ts). Extending
// EducationEntryInput keeps the optimistic-update path in useChildResource
// happy without leaking server-only columns (createdAt, profileId, etc.).
type EducationEntryRow = EducationEntryInput & {
  id: string;
  university?: EducationEntryUniversitySummary | null;
};

// Token colors reused by the spine — kept inline (rather than in styles.ts)
// so the spine treatment can evolve independently per tab.
const SPINE_DOT_CURRENT = "var(--color-accent-cyan)";
const SPINE_DOT_OLDER = "var(--color-accent-lavender)";

// Resolves the display name to show in the combobox input and in the
// collapsed row header. Prefer the joined university's canonical name when
// the row has a linked University; fall back to free-text schoolName.
function schoolDisplayName(row: EducationEntryRow): string {
  if (row.university?.name) return row.university.name;
  return row.schoolName ?? "";
}

// Formats a start–end year pair for the spine date stamp. Empty years
// render as an em-dash so the spine stays vertically aligned. A null
// endYear collapses to "Present" — these rows also win the "current" color.
function formatYearRange(start: number | null | undefined, end: number | null | undefined): string {
  const s = typeof start === "number" ? String(start) : "—";
  const e = typeof end === "number" ? String(end) : start ? "Present" : "—";
  return `${s} – ${e}`;
}

interface Props {
  initialData: UserProfile | null;
}

export function EducationHistoryForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);
  const reduced = useReducedMotion();
  const {
    items,
    loading,
    error,
    recentlySavedIds,
    lastCreatedId,
    consumeLastCreatedId,
    create,
    update,
    remove,
  } = useChildResource<EducationEntryRow>("education-entries");

  // Section-header SavedPill flash is a pure derivation of the per-row save
  // set — useChildResource already TTLs ids out of `recentlySavedIds` after
  // ~2s, so as long as any id is in the set we light up the header pill.
  // Keeping this derived (vs. mirrored via setState in an effect) sidesteps
  // React 19's react-hooks/set-state-in-effect rule.
  const headerFlash = recentlySavedIds.size > 0;

  // Index of the row that "owns" the current (cyan) dot. A row counts as
  // current when it has no endYear (in progress) OR has the latest endYear
  // in the list. Falls back to the first row if no years are set anywhere.
  const currentRowId = useMemo(() => {
    if (items.length === 0) return null;
    const inProgress = items.find((r) => r.endYear == null && r.startYear != null);
    if (inProgress) return inProgress.id;
    const withEnd = items.filter((r) => typeof r.endYear === "number");
    if (withEnd.length === 0) return items[0]?.id ?? null;
    const latest = withEnd.reduce((a, b) =>
      (a.endYear ?? 0) >= (b.endYear ?? 0) ? a : b,
    );
    return latest.id;
  }, [items]);

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        universityId: null,
        schoolName: "New school",
        degree: "Bachelor's",
        fieldOfStudy: "Field of study",
        startYear: null,
        endYear: null,
        gpa: null,
        honors: null,
        activities: null,
        order: 0,
      });
    } catch {
      toast.error("Failed to add education entry");
    }
  };

  const handleUpdate = async (id: string, patch: Partial<EducationEntryRow>) => {
    try {
      await update(id, patch);
    } catch {
      toast.error("Failed to save changes");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await remove(id);
    } catch {
      toast.error("Failed to remove entry");
    }
  };

  const handleReorder = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    if (!a || !b) return;
    try {
      // Optimistic swap inside useChildResource handles UI flicker.
      await Promise.all([
        update(a.id, { order: b.order }),
        update(b.id, { order: a.order }),
      ]);
    } catch {
      toast.error("Failed to reorder");
    }
  };

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />

      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={
            <FormEyebrow accent>
              stage · education · {items.length} {items.length === 1 ? "entry" : "entries"}
            </FormEyebrow>
          }
          title="Where you learned"
          subtitle="Degrees, bootcamps, programs — pinned to a vertical spine, ordered by graduation year. Edit inline; we save as you blur."
          right={<SavedPill visible={headerFlash} />}
        />

        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : items.length === 0 ? (
          <div className="space-y-3">
            <EmptyState content={EMPTY_STATES["education-entries"]} />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!identityOk}
              className={addRowBtnClass}
            >
              + Add education
            </button>
          </div>
        ) : (
          <EducationSpine
            items={items}
            currentRowId={currentRowId}
            recentlySavedIds={recentlySavedIds}
            lastCreatedId={lastCreatedId}
            onAutoFocusConsumed={consumeLastCreatedId}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onAdd={handleAdd}
            reduced={reduced ?? false}
          />
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EducationSpine — the lavender vertical guide + per-row chrome. Kept in the
// same file because the row body is so coupled to the spine column widths
// that splitting them would invite drift; the whole module clocks well under
// the 400-line guidance in PATTERN.md.
// ---------------------------------------------------------------------------
interface SpineProps {
  items: EducationEntryRow[];
  currentRowId: string | null;
  recentlySavedIds: Set<string>;
  lastCreatedId: string | null;
  onAutoFocusConsumed: () => void;
  onUpdate: (id: string, patch: Partial<EducationEntryRow>) => void;
  onRemove: (id: string) => void;
  onReorder: (index: number, dir: -1 | 1) => void;
  onAdd: () => void;
  reduced: boolean;
}

function EducationSpine({
  items,
  currentRowId,
  recentlySavedIds,
  lastCreatedId,
  onAutoFocusConsumed,
  onUpdate,
  onRemove,
  onReorder,
  onAdd,
  reduced,
}: SpineProps) {
  // Refs keyed by row id so we can scroll + focus the just-created entry.
  // Same layout-effect trick the shared list-editor uses; we duplicate it
  // here because the spine bypasses ListEditor for layout control. Stored
  // as HTMLElement (not HTMLDivElement) so an <article> ref binds cleanly.
  const rowRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  useLayoutEffect(() => {
    if (!lastCreatedId) return;
    const row = rowRefs.current.get(lastCreatedId);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    const focusable = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], input:not([type]), input[type="url"], input[type="number"], textarea',
    );
    if (focusable) {
      focusable.focus();
      try {
        focusable.select();
      } catch {
        // Some input types reject select(); safe to ignore.
      }
    }
    onAutoFocusConsumed();
  }, [lastCreatedId, onAutoFocusConsumed, reduced]);

  return (
    // pl-9 leaves a 36px gutter for the spine + dot, matching direction-a.jsx.
    <div className="relative pl-9">
      {/* Spine guide — solid hairline on top of a faint lavender gradient
          so the line reads as "lavender-tinted" rather than pure white. */}
      <div
        aria-hidden
        className="absolute left-[14px] top-2 bottom-2 w-px bg-white/[0.08]"
      />
      <div
        aria-hidden
        className="absolute left-[13px] top-2 bottom-2 w-[3px] rounded-[2px] opacity-[0.18]"
        style={{
          background:
            "linear-gradient(180deg, var(--color-accent-cyan) 0%, var(--color-accent-lavender) 100%)",
        }}
      />

      <div className="space-y-3.5">
        {items.map((row, idx) => {
          const isCurrent = row.id === currentRowId;
          const isJustAdded = row.id === lastCreatedId;
          const isJustSaved = recentlySavedIds.has(row.id);
          const dotColor = isCurrent ? SPINE_DOT_CURRENT : SPINE_DOT_OLDER;
          const animStyle = !reduced && isJustAdded
            ? { animation: "pp-fade-up 360ms cubic-bezier(0.22,1,0.36,1)" }
            : undefined;
          return (
            <article
              key={row.id}
              ref={(el) => {
                if (el) rowRefs.current.set(row.id, el);
                else rowRefs.current.delete(row.id);
              }}
              // group/* for the hover-bleed gradient on the spine side.
              className={[
                "group/spine relative rounded-[14px] border px-4 py-3.5",
                "transition-colors duration-200",
                isCurrent
                  ? "border-[rgba(34,211,238,0.30)] bg-[rgba(34,211,238,0.04)]"
                  : "border-white/[0.08] bg-white/[0.015] hover:border-white/[0.14]",
              ].join(" ")}
              style={animStyle}
            >
              {/* Hover gradient bleed from the spine — only on non-current rows
                  (the current row already carries its own cyan tint). */}
              {!isCurrent && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-l-[14px] opacity-0 group-hover/spine:opacity-100 transition-opacity duration-300"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(196,181,253,0.08) 0%, transparent 100%)",
                  }}
                />
              )}

              {/* Spine dot. Lives outside the card padding via negative left. */}
              <span
                aria-hidden
                className="absolute top-[20px] -left-[24px] w-[11px] h-[11px] rounded-full"
                style={{
                  background: dotColor,
                  boxShadow: isCurrent
                    ? `0 0 0 4px ${dotColor}28, 0 0 14px ${dotColor}80`
                    : undefined,
                }}
              />

              <EducationRow
                row={row}
                index={idx}
                total={items.length}
                isCurrent={isCurrent}
                isJustSaved={isJustSaved}
                onPatch={(patch) => onUpdate(row.id, patch)}
                onRemove={() => onRemove(row.id)}
                onMoveUp={() => onReorder(idx, -1)}
                onMoveDown={() => onReorder(idx, 1)}
              />
            </article>
          );
        })}
      </div>

      <div className="mt-3.5">
        <button
          type="button"
          onClick={onAdd}
          className={addRowBtnClass}
        >
          + Add education
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EducationRow — the header (degree · school · years) plus the inline editing
// block. All fields use blur-to-save through the `onPatch` callback.
// ---------------------------------------------------------------------------
interface RowProps {
  row: EducationEntryRow;
  index: number;
  total: number;
  isCurrent: boolean;
  isJustSaved: boolean;
  onPatch: (patch: Partial<EducationEntryRow>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function EducationRow({
  row,
  index,
  total,
  isCurrent,
  isJustSaved,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: RowProps) {
  // Combobox handlers — kept in the row component so each instance has its
  // own closure over the row's id (avoids stale-id bugs when rows reorder).
  // Either branch patches BOTH universityId AND schoolName so we never leave
  // stale data on the other side (server's XOR constraint enforces this too).
  const handlePickUniversity = (id: string, name: string) => {
    onPatch({
      universityId: id,
      schoolName: null,
      university: { id, name, city: null, state: null },
    });
  };
  const handleClearUniversity = () => {
    onPatch({ universityId: null, schoolName: null, university: null });
  };
  const handleFreeTextSchool = (text: string) => {
    const next = text.length > 0 ? text : null;
    if (next === (row.schoolName ?? null) && !row.universityId) return;
    onPatch({ universityId: null, schoolName: next, university: null });
  };

  const school = schoolDisplayName(row);
  const yearRange = formatYearRange(row.startYear, row.endYear);

  return (
    <div className="space-y-3">
      {/* Header — degree headline + school + year stamp, plus row chrome. */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-display text-[16px] font-semibold leading-tight tracking-[-0.015em] text-text">
            {row.degree || "Untitled degree"}
            {row.fieldOfStudy && (
              <span className="text-text-muted font-medium">
                {" "}
                · {row.fieldOfStudy}
              </span>
            )}
          </h3>
          <div className="mt-1 text-[13px] text-text-muted flex items-center flex-wrap gap-x-2 gap-y-1">
            <span className="text-text font-medium">
              {school || <span className="text-text-dim italic">No school</span>}
            </span>
            <span aria-hidden className="text-text-dim">·</span>
            <span className="font-mono text-[11.5px] text-text-dim tabular-nums">
              {yearRange}
            </span>
            {typeof row.gpa === "number" && (
              <>
                <span aria-hidden className="text-text-dim">·</span>
                <span className="font-mono text-[11.5px] text-text-dim tabular-nums">
                  GPA {row.gpa.toFixed(2)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCurrent && (
            <span
              className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--color-accent-cyan)] bg-[rgba(34,211,238,0.10)] border border-[rgba(34,211,238,0.30)] px-2 py-[2px] rounded-full"
            >
              Current
            </span>
          )}
          {isJustSaved && <SavedPill />}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move up"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move down"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-text-muted hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove entry"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
            >
              Remove
            </button>
          </div>
        </div>
      </header>

      {/* Honors / activities surfaced just under the header when populated.
          Less-prominent block keeps the headline scannable. */}
      {(row.honors || row.activities) && (
        <div className="space-y-1 text-[13px] text-text-muted">
          {row.honors && (
            <div>
              <FormEyebrow>honors</FormEyebrow>{" "}
              <span className="ml-1">{row.honors}</span>
            </div>
          )}
          {row.activities && (
            <div className="leading-relaxed">
              <FormEyebrow>activities</FormEyebrow>{" "}
              <span className="ml-1 whitespace-pre-wrap">{row.activities}</span>
            </div>
          )}
        </div>
      )}

      {/* Inline editing block — divider above so the read/edit affordance is
          visually separated from the headline. */}
      <div className="border-t border-white/[0.06] pt-3 mt-1 space-y-3">
        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>School name</label>
            <UniversityCombobox
              value={school}
              universityId={row.universityId ?? undefined}
              onSelect={handlePickUniversity}
              onClear={handleClearUniversity}
              onFreeText={handleFreeTextSchool}
              placeholder="Massachusetts Institute of Technology"
            />
          </div>
          <div>
            <label className={labelClass}>Degree</label>
            <input
              className={directionAInputClass}
              defaultValue={row.degree}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== row.degree) onPatch({ degree: v });
              }}
              placeholder="Bachelor's of Science"
            />
          </div>
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Field of study</label>
            <input
              className={directionAInputClass}
              defaultValue={row.fieldOfStudy}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== row.fieldOfStudy) onPatch({ fieldOfStudy: v });
              }}
              placeholder="Computer Science"
            />
          </div>
          <div>
            <label className={labelClass}>
              GPA{" "}
              <span className="text-text-dim font-normal">(optional)</span>
            </label>
            <input
              className={`${directionAInputClass} font-mono tabular-nums`}
              type="number"
              step="0.01"
              min="0"
              max="5"
              defaultValue={row.gpa ?? ""}
              onBlur={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                if (next !== (row.gpa ?? null)) onPatch({ gpa: next });
              }}
              placeholder="3.85"
            />
          </div>
        </div>

        <div className={gridTwoCol}>
          <div>
            <label className={labelClass}>Start year</label>
            <input
              className={`${directionAInputClass} font-mono tabular-nums`}
              type="number"
              min="1900"
              max="2100"
              defaultValue={row.startYear ?? ""}
              onBlur={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                if (next !== (row.startYear ?? null)) onPatch({ startYear: next });
              }}
              placeholder="2018"
            />
          </div>
          <div>
            <label className={labelClass}>
              End year{" "}
              <span className="text-text-dim font-normal">
                (leave blank if in progress)
              </span>
            </label>
            <input
              className={`${directionAInputClass} font-mono tabular-nums`}
              type="number"
              min="1900"
              max="2100"
              defaultValue={row.endYear ?? ""}
              onBlur={(e) => {
                const raw = e.target.value;
                const next = raw === "" ? null : Number(raw);
                if (next !== (row.endYear ?? null)) onPatch({ endYear: next });
              }}
              placeholder="2022"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Honors{" "}
            <span className="text-text-dim font-normal">(optional)</span>
          </label>
          <input
            className={directionAInputClass}
            defaultValue={row.honors ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (row.honors ?? "")) onPatch({ honors: v || null });
            }}
            placeholder="Cum laude · Dean's list 6 semesters"
          />
        </div>

        <div>
          <label className={labelClass}>
            Activities{" "}
            <span className="text-text-dim font-normal">(optional)</span>
          </label>
          <textarea
            className={`${directionAInputClass} resize-y`}
            rows={3}
            maxLength={5000}
            defaultValue={row.activities ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (row.activities ?? "")) onPatch({ activities: v || null });
            }}
            placeholder="Clubs, leadership, research..."
          />
        </div>
      </div>
    </div>
  );
}
