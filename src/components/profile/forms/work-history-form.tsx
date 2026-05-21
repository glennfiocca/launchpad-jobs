"use client";

/**
 * WorkHistoryForm — Direction A vertical spine timeline.
 *
 * Each role anchors to a colored dot on a left-edge vertical spine. The
 * current role wears a lavender / cyan pulse; past roles get a stage-tinted
 * static dot. Hovering a row paints a faint lavender → transparent bleed
 * rightward from the spine. Reordering flashes the lavender highlight on the
 * moved row via `recentlyReorderedIds` wired through the enhanced ListEditor.
 *
 * Hard contracts preserved from the legacy form:
 *   - Blur-to-save on every field (no inline Save buttons).
 *   - No modals.
 *   - useChildResource optimistic CRUD untouched (same shape in / out).
 *   - Reorder still swaps `order` columns between adjacent rows.
 */

import { useEffect, useMemo, useRef } from "react";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
} from "@/types/_shared/profile-enums";
import type { WorkExperienceInput } from "@/types";
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
import {
  IdentityRequiredNotice,
  isIdentityComplete,
} from "./_shared/identity-gate";
import { useChildResource } from "./_shared/use-child-resource";
import { useReorderFlash } from "./_shared/use-reorder-flash";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// Each row is a WorkExperienceInput plus a server-assigned id.
type WorkExperienceRow = WorkExperienceInput & { id: string };

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

// Stage-palette dot colors, cycled through past roles by index so the spine
// reads like the Direction A prototype (cyan → magenta → violet → indigo).
// Lavender token is reserved for the "current" treatment.
const PAST_DOT_COLORS = [
  "var(--color-stage-offer)",
  "var(--color-stage-interview)",
  "var(--color-stage-phone)",
  "var(--color-stage-applied)",
] as const;

const LAVENDER = "var(--color-accent-lavender)";
const CYAN = "var(--color-accent-cyan)";

// ── Date helpers ────────────────────────────────────────────────────────────

// Convert a Date | ISO-string from the API to a YYYY-MM-DD value for the
// <input type="date"> control. Returns "" for null/undefined.
function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// "" → null for nullable end-date columns. Otherwise pass through.
function fromDateInput(v: string): string | null {
  return v ? v : null;
}

// Render a YYYY-MM-DD or ISO date as just the year, for the timeline header.
function toYear(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return String(date.getUTCFullYear());
}

// "2018 — 2020" / "2023 — Present" — the date range that sits next to each
// role title on the spine.
function formatDateRange(row: WorkExperienceRow): string {
  const start = toYear(row.startDate) ?? "—";
  if (row.isCurrent) return `${start} — Present`;
  const end = toYear(row.endDate);
  return end ? `${start} — ${end}` : start;
}

// Years spanned by a single role, used for the aggregate years-total in the
// header. Falls back to 0 if either date is missing or invalid.
function yearsOfRole(row: WorkExperienceRow, now: Date): number {
  if (!row.startDate) return 0;
  const start = new Date(row.startDate);
  if (Number.isNaN(start.getTime())) return 0;
  const end = row.isCurrent
    ? now
    : row.endDate
    ? new Date(row.endDate)
    : now;
  if (Number.isNaN(end.getTime())) return 0;
  const ms = Math.max(0, end.getTime() - start.getTime());
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

interface WorkHistoryFormProps {
  initialData: UserProfile | null;
}

export function WorkHistoryForm({ initialData }: WorkHistoryFormProps) {
  const reduced = useReducedMotion();
  const identityOk = isIdentityComplete(initialData);
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
  } = useChildResource<WorkExperienceRow>("work-experience");

  // Lavender flash on rows that just reordered — see useReorderFlash for
  // timer / cleanup semantics.
  const { reorderFlashIds: recentlyReorderedIds, flashPair } =
    useReorderFlash();

  // ── Derived header stats ──────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);
  const totalYears = useMemo(() => {
    const sum = items.reduce((acc, r) => acc + yearsOfRole(r, now), 0);
    return Math.round(sum * 10) / 10;
  }, [items, now]);
  const roleCount = items.length;
  const sectionRecentlySaved = recentlySavedIds.size > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        title: "New role",
        company: "New company",
        companyUrl: "",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: null,
        isCurrent: false,
        location: null,
        employmentType: "full-time",
        description: null,
        order: 0, // server auto-assigns when 0
      });
    } catch {
      toast.error("Failed to add work experience");
    }
  };

  const handleRemove = async (idx: number) => {
    const row = items[idx];
    if (!row) return;
    try {
      await remove(row.id);
    } catch {
      toast.error("Failed to remove entry");
    }
  };

  const handleUpdate = async (
    idx: number,
    patch: Partial<WorkExperienceRow>,
  ) => {
    const row = items[idx];
    if (!row) return;
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save changes");
    }
  };

  const handleReorder = async (oldIdx: number, newIdx: number) => {
    if (newIdx < 0 || newIdx >= items.length) return;
    const a = items[oldIdx];
    const b = items[newIdx];
    if (!a || !b) return;
    // Swap `order` values between the two rows. Optimistic updates inside
    // useChildResource handle UI flicker; on failure both calls roll back.
    flashPair(a.id, b.id);
    try {
      await Promise.all([
        update(a.id, { order: b.order }),
        update(b.id, { order: a.order }),
      ]);
    } catch {
      toast.error("Failed to reorder");
    }
  };

  // ── Header right-slot: stat strip + SavedPill ─────────────────────────────
  const headerRight = (
    <div className="flex items-center gap-3">
      <span className="font-mono tabular-nums text-[11px] text-text-dim">
        {roleCount} {roleCount === 1 ? "role" : "roles"}
        {totalYears > 0 && (
          <>
            {" · "}
            {totalYears.toFixed(1)}y total
          </>
        )}
      </span>
      <SavedPill visible={sectionRecentlySaved} />
    </div>
  );

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />

      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={
            <FormEyebrow accent>
              stage · work history · your spine
            </FormEyebrow>
          }
          title="Your work, on a spine"
          subtitle="Edit anywhere inline — we save as you blur. Reorder with the arrow buttons. The current role wears the lavender pulse."
          right={headerRight}
        />

        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : items.length === 0 ? (
          // Empty state — render the standard EmptyState alongside the
          // Add CTA so a brand-new user still gets the timeline framing.
          <div className="space-y-3">
            <EmptyState content={EMPTY_STATES["work-experience"]} />
            <button
              type="button"
              onClick={handleAdd}
              className={addRowBtnClass}
            >
              <Plus className="size-3.5" aria-hidden />
              Drop your first role on the spine
            </button>
          </div>
        ) : (
          <SpineTimeline
            items={items}
            reduced={Boolean(reduced)}
            recentlySavedIds={recentlySavedIds}
            recentlyReorderedIds={recentlyReorderedIds}
            lastCreatedId={lastCreatedId}
            onAutoFocusConsumed={consumeLastCreatedId}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onUpdate={handleUpdate}
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

// ── SpineTimeline ──────────────────────────────────────────────────────────
// The Direction A spine: a vertical hairline + lavender gradient highlight
// behind the role list, with dots pinned to the spine and rows offset to its
// right. Manages row auto-focus on create (mirrors the ListEditor behavior)
// since we render row cards directly to retain visual control of the spine.

interface SpineTimelineProps {
  items: WorkExperienceRow[];
  reduced: boolean;
  recentlySavedIds: Set<string>;
  recentlyReorderedIds: Set<string>;
  lastCreatedId: string | null;
  onAutoFocusConsumed: () => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  onUpdate: (index: number, patch: Partial<WorkExperienceRow>) => void;
}

function SpineTimeline({
  items,
  reduced,
  recentlySavedIds,
  recentlyReorderedIds,
  lastCreatedId,
  onAutoFocusConsumed,
  onAdd,
  onRemove,
  onReorder,
  onUpdate,
}: SpineTimelineProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Auto-focus + scroll the newly-created row's first text input — same
  // contract the list-editor honors so the UX matches sibling tabs.
  useEffect(() => {
    if (!lastCreatedId) return;
    const row = rowRefs.current.get(lastCreatedId);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = row.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(
      'input[type="text"], input:not([type]), input[type="url"], input[type="email"], textarea',
    );
    if (focusable) {
      focusable.focus();
      try {
        focusable.select();
      } catch {
        // Some input types reject select(); safely ignore.
      }
    }
    onAutoFocusConsumed();
  }, [lastCreatedId, onAutoFocusConsumed]);

  return (
    <div className="relative pl-9">
      {/* Vertical guide hairline */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-2 bottom-2 w-px bg-white/[0.08]"
      />
      {/* Lavender gradient highlight on the spine — sits over the hairline */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[13px] top-2 bottom-2 w-[3px] rounded-[2px] opacity-[0.18]"
        style={{
          background:
            "linear-gradient(180deg, var(--color-accent-cyan) 0%, var(--color-accent-lavender) 100%)",
        }}
      />

      <ul className="space-y-3.5">
        {items.map((row, index) => {
          const isJustAdded = row.id === lastCreatedId;
          const isJustReordered = recentlyReorderedIds.has(row.id);
          const isSaved = recentlySavedIds.has(row.id);
          // Past roles cycle through the stage palette; the current role
          // wears the lavender accent so it stands out on the spine.
          const dotColor = row.isCurrent
            ? LAVENDER
            : PAST_DOT_COLORS[index % PAST_DOT_COLORS.length];

          const animation =
            !reduced && isJustAdded
              ? "pp-fade-up 360ms cubic-bezier(0.22,1,0.36,1)"
              : !reduced && isJustReordered
              ? "pp-reorder-flash 1200ms ease-out"
              : undefined;

          return (
            <li key={row.id} className="relative">
              {/* Dot pinned to the spine */}
              <span
                aria-hidden
                className="pointer-events-none absolute -left-[26px] top-[18px] block size-[11px] rounded-full"
                style={{
                  background: dotColor,
                  boxShadow: row.isCurrent
                    ? `0 0 0 4px rgba(196,181,253,0.16), 0 0 14px rgba(196,181,253,0.55)`
                    : undefined,
                }}
              />

              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(row.id, el);
                  else rowRefs.current.delete(row.id);
                }}
                className={[
                  "group relative overflow-hidden rounded-[14px] p-4 transition-colors",
                  row.isCurrent
                    ? "border border-[rgba(196,181,253,0.30)] bg-[rgba(196,181,253,0.04)]"
                    : "border border-white/[0.08] bg-white/[0.015] hover:border-white/[0.14]",
                ].join(" ")}
                style={animation ? { animation } : undefined}
              >
                {/* Hover bleed — lavender → transparent gradient from the
                    left edge, only on past roles (current is already tinted). */}
                {!row.isCurrent && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-32 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(196,181,253,0.10) 0%, rgba(196,181,253,0) 100%)",
                    }}
                  />
                )}

                <RoleRowHeader
                  row={row}
                  index={index}
                  isLast={index === items.length - 1}
                  isSaved={isSaved}
                  onMoveUp={() => onReorder(index, index - 1)}
                  onMoveDown={() => onReorder(index, index + 1)}
                  onRemove={() => onRemove(index)}
                />

                <WorkExperienceFields
                  row={row}
                  patch={(p) => onUpdate(index, p)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <button type="button" onClick={onAdd} className={addRowBtnClass}>
          <Plus className="size-3.5" aria-hidden />
          Drop another role on the spine
        </button>
      </div>
    </div>
  );
}

// ── RoleRowHeader ──────────────────────────────────────────────────────────
// Title / company / date range / location strip + reorder & remove controls.
// Reorder icons are lucide-react ArrowUp / ArrowDown; aria-labels match the
// list-editor's "Move up" / "Move down" / "Remove" copy for screen readers.

interface RoleRowHeaderProps {
  row: WorkExperienceRow;
  index: number;
  isLast: boolean;
  isSaved: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function RoleRowHeader({
  row,
  index,
  isLast,
  isSaved,
  onMoveUp,
  onMoveDown,
  onRemove,
}: RoleRowHeaderProps) {
  return (
    <header className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.015em] text-text">
          {row.title || (
            <span className="text-text-dim">Untitled role</span>
          )}
        </h3>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-text-muted">
          <span className="font-medium text-text">
            {row.company || (
              <span className="text-text-dim">Unnamed company</span>
            )}
          </span>
          <span className="text-text-dim" aria-hidden>
            ·
          </span>
          <span className="font-mono tabular-nums text-[11.5px] text-text-dim">
            {formatDateRange(row)}
          </span>
          {row.location && (
            <>
              <span className="text-text-dim" aria-hidden>
                ·
              </span>
              <span className="font-mono text-[11.5px] text-text-dim">
                {row.location}
              </span>
            </>
          )}
        </div>
      </div>

      {row.isCurrent && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
          style={{
            color: LAVENDER,
            borderColor: "rgba(196,181,253,0.30)",
            background: "rgba(196,181,253,0.10)",
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: CYAN }}
          />
          Current
        </span>
      )}

      {isSaved && <SavedPill />}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label="Move up"
          className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-text-muted transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move down"
          className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-text-muted transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove entry"
          className="inline-flex h-7 items-center rounded-md border border-red-500/30 bg-red-500/10 px-2 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          Remove
        </button>
      </div>
    </header>
  );
}

// ── WorkExperienceFields ───────────────────────────────────────────────────
// Inline-edit field group — every text input commits on blur via the `patch`
// callback wired to useChildResource.update. Identical contract to the legacy
// implementation; only the visual chrome (directionAInputClass) changed.

interface WorkExperienceFieldsProps {
  row: WorkExperienceRow;
  patch: (p: Partial<WorkExperienceRow>) => void;
}

function WorkExperienceFields({ row, patch }: WorkExperienceFieldsProps) {
  return (
    <div className="mt-3 space-y-3">
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={directionAInputClass}
            defaultValue={row.title}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== row.title) patch({ title: v });
            }}
            placeholder="Senior Software Engineer"
          />
        </div>
        <div>
          <label className={labelClass}>Company</label>
          <input
            className={directionAInputClass}
            defaultValue={row.company}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== row.company) patch({ company: v });
            }}
            placeholder="Acme Corp"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Company URL</label>
          <input
            className={`${directionAInputClass} font-mono`}
            type="url"
            defaultValue={row.companyUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (row.companyUrl ?? "")) {
                patch({ companyUrl: v || null });
              }
            }}
            placeholder="https://acme.com"
          />
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input
            className={directionAInputClass}
            defaultValue={row.location ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (row.location ?? "")) patch({ location: v || null });
            }}
            placeholder="San Francisco, CA"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Start date</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="date"
            defaultValue={toDateInput(row.startDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && v !== toDateInput(row.startDate)) {
                patch({ startDate: v });
              }
            }}
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="date"
            disabled={row.isCurrent}
            defaultValue={toDateInput(row.endDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(row.endDate)) {
                patch({ endDate: fromDateInput(v) });
              }
            }}
          />
        </div>
      </div>

      <div className="max-w-xs">
        <label className={labelClass}>Employment type</label>
        <select
          className={directionAInputClass}
          value={row.employmentType}
          onChange={(e) =>
            patch({ employmentType: e.target.value as EmploymentType })
          }
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={row.isCurrent}
          onChange={(e) => {
            const isCurrent = e.target.checked;
            // Clearing endDate when turning isCurrent on enforces the
            // server-side superRefine constraint client-side.
            patch(
              isCurrent
                ? { isCurrent: true, endDate: null }
                : { isCurrent: false },
            );
          }}
          className="size-4 rounded accent-[var(--color-accent-lavender)]"
        />
        <span className="text-sm text-text-muted">I currently work here</span>
      </label>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${directionAInputClass} resize-y`}
          rows={4}
          maxLength={5000}
          defaultValue={row.description ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (row.description ?? "")) {
              patch({ description: v || null });
            }
          }}
          placeholder="Led a team of 4 engineers building..."
        />
      </div>
    </div>
  );
}
