"use client";

/**
 * skills-tier-grid.tsx — Skills tier grid + chip editor for the
 * Skills/Languages tab.
 *
 * Exported public surface: SkillsSection only.
 * All other components are internal to this module.
 *
 * Hard contracts preserved:
 *   - Blur-to-save; no Save buttons on rows.
 *   - No modal portals — inline edit-in-place only.
 *   - TypeScript strict, no `any`.
 *   - All colors from @theme tokens.
 *   - tabular-nums on numeric displays.
 *   - All framer-motion animations gated on useReducedMotion().
 *   - A11y: SkillChipEditor closes on outside mousedown AND focusin (keyboard
 *     tab-out), and on Escape key.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { toast } from "sonner";
import { useReducedMotion } from "framer-motion";
import { SKILL_CATEGORIES, type SkillCategory } from "@/types/_shared/profile-enums";
import type { SkillInput } from "@/types";
import {
  directionAInputClass,
  directionASectionClass,
  labelClass,
  addRowBtnClass,
} from "./_shared/styles";
import { FormEyebrow, SavedPill, SectionHeader } from "./_shared/atoms";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";
import {
  StarGlyph,
  TierStars,
  ProficiencyStarPicker,
} from "./_shared/star-glyph";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants (skills-exclusive)
// ─────────────────────────────────────────────────────────────────────────────

type SkillRow = SkillInput & { id: string };

type ProficiencyTier = 1 | 2 | 3 | 4 | 5;

interface TierDescriptor {
  readonly stars: ProficiencyTier;
  readonly label: string;
  readonly help: string;
}

// Top-to-bottom: 5★ Expert → 1★ Exposure. Order is the display order in the
// tier grid.
const TIER_LABELS: ReadonlyArray<TierDescriptor> = [
  { stars: 5, label: "Expert", help: "reach for this without thinking" },
  { stars: 4, label: "Advanced", help: "comfortable shipping in production" },
  { stars: 3, label: "Working", help: "productive with occasional reference" },
  { stars: 2, label: "Familiar", help: "shipped a few times, still picking up" },
  { stars: 1, label: "Exposure", help: "read, dabbled, would like to learn" },
];

const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  language: "Language",
  framework: "Framework",
  tool: "Tool",
  domain: "Domain",
  soft: "Soft skill",
};

// New skills default to "Working" (3★) per spec.
const DEFAULT_NEW_SKILL_TIER: ProficiencyTier = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (skills-exclusive)
// ─────────────────────────────────────────────────────────────────────────────

// Pick a unique placeholder name (case-insensitive) so we don't trip the
// server's @@unique([profileId, name]) constraint when the user rapidly
// clicks Add. Bounded loop to avoid theoretical infinite.
function nextSkillPlaceholder(existing: readonly string[]): string {
  const prefix = "New skill";
  const taken = new Set(existing.map((n) => n.toLowerCase().trim()));
  let i = existing.length + 1;
  while (i < existing.length + 1000) {
    const candidate = `${prefix} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    i += 1;
  }
  return `${prefix} ${Date.now()}`;
}

// Case-insensitive name conflict check excluding the row's own id.
function hasSkillNameConflict(
  rows: readonly { id: string; name: string }[],
  ownId: string,
  candidate: string,
): boolean {
  const normalized = candidate.toLowerCase().trim();
  if (!normalized) return false;
  return rows.some(
    (r) => r.id !== ownId && r.name.toLowerCase().trim() === normalized,
  );
}

// Clamp arbitrary numeric proficiency to a known 1-5 tier.
function clampTier(value: number): ProficiencyTier {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return Math.round(value) as ProficiencyTier;
}

// Group skills by proficiency tier — pure view-layer transform over the
// flat list returned by useChildResource. Preserves array order within
// each tier so the user can still see the order they entered things.
function groupByTier(skills: readonly SkillRow[]): Map<ProficiencyTier, SkillRow[]> {
  const map = new Map<ProficiencyTier, SkillRow[]>();
  for (const tier of TIER_LABELS) map.set(tier.stars, []);
  for (const skill of skills) {
    const tier = clampTier(skill.proficiency);
    const bucket = map.get(tier);
    if (bucket) bucket.push(skill);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillsSection — public export; wraps the tier grid with resource wiring.
// ─────────────────────────────────────────────────────────────────────────────

interface SkillsSectionProps {
  identityOk: boolean;
}

export function SkillsSection({ identityOk }: SkillsSectionProps) {
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
  } = useChildResource<SkillRow>("skills");

  // The id of the chip currently expanded into its inline editor. Only one
  // is expanded at a time — clicking another auto-collapses the previous.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-expand the just-created row so the user immediately lands in the
  // editor (matches ListEditor's auto-focus contract for the other list tabs).
  // Uses React's official "adjusting state on prop change" pattern.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastSeenCreatedId, setLastSeenCreatedId] = useState<string | null>(null);
  if (lastCreatedId && lastCreatedId !== lastSeenCreatedId) {
    setLastSeenCreatedId(lastCreatedId);
    setExpandedId(lastCreatedId);
    consumeLastCreatedId();
  }

  const sectionRecentlySaved = recentlySavedIds.size > 0;
  const grouped = useMemo(() => groupByTier(items), [items]);

  const handleAdd = async (tier: ProficiencyTier = DEFAULT_NEW_SKILL_TIER) => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: nextSkillPlaceholder(items.map((s) => s.name)),
        category: "language",
        proficiency: tier,
        yearsUsed: null,
        order: 0,
      });
    } catch {
      toast.error("Couldn't add skill — make sure the name is unique");
    }
  };

  const handlePatch = async (row: SkillRow, patch: Partial<SkillRow>) => {
    if (
      typeof patch.name === "string" &&
      hasSkillNameConflict(items, row.id, patch.name)
    ) {
      toast.error("That skill name is already in the list");
      return;
    }
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save skill");
    }
  };

  const handleRemove = async (row: SkillRow) => {
    try {
      await remove(row.id);
      if (expandedId === row.id) setExpandedId(null);
    } catch {
      toast.error("Failed to remove skill");
    }
  };

  return (
    <section className={`${directionASectionClass} flex flex-col h-full`}>
      <SectionHeader
        eyebrow={
          <FormEyebrow accent>
            skills · tiered by proficiency
          </FormEyebrow>
        }
        title="What you reach for"
        subtitle="Group your skills by how reliably you can ship with them. Click any chip to edit in place — change its tier to move it between rows."
        right={<SavedPill visible={sectionRecentlySaved} />}
      />

      {loading ? (
        <p className="text-sm text-text-dim">Loading…</p>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <SkillTierGrid
            grouped={grouped}
            expandedId={expandedId}
            onExpand={setExpandedId}
            onPatch={handlePatch}
            onRemove={handleRemove}
            recentlySavedIds={recentlySavedIds}
            lastCreatedId={lastCreatedId}
          />

          {items.length === 0 && (
            <EmptyState content={EMPTY_STATES.skills} />
          )}

          <button
            type="button"
            onClick={() => handleAdd()}
            disabled={!identityOk}
            className={addRowBtnClass}
          >
            + Add skill
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillTierGrid — 5 rows, one per tier
// ─────────────────────────────────────────────────────────────────────────────

interface SkillTierGridProps {
  grouped: Map<ProficiencyTier, SkillRow[]>;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onPatch: (row: SkillRow, patch: Partial<SkillRow>) => Promise<void>;
  onRemove: (row: SkillRow) => Promise<void>;
  recentlySavedIds: Set<string>;
  lastCreatedId: string | null;
}

function SkillTierGrid({
  grouped,
  expandedId,
  onExpand,
  onPatch,
  onRemove,
  recentlySavedIds,
  lastCreatedId,
}: SkillTierGridProps) {
  return (
    <div className="rounded-[12px] border border-white/[0.06] overflow-hidden divide-y divide-white/[0.06]">
      {TIER_LABELS.map((tier) => {
        const rows = grouped.get(tier.stars) ?? [];
        return (
          <SkillTierRow
            key={tier.stars}
            tier={tier}
            rows={rows}
            expandedId={expandedId}
            onExpand={onExpand}
            onPatch={onPatch}
            onRemove={onRemove}
            recentlySavedIds={recentlySavedIds}
            lastCreatedId={lastCreatedId}
          />
        );
      })}
    </div>
  );
}

interface SkillTierRowProps {
  tier: TierDescriptor;
  rows: readonly SkillRow[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onPatch: (row: SkillRow, patch: Partial<SkillRow>) => Promise<void>;
  onRemove: (row: SkillRow) => Promise<void>;
  recentlySavedIds: Set<string>;
  lastCreatedId: string | null;
}

function SkillTierRow({
  tier,
  rows,
  expandedId,
  onExpand,
  onPatch,
  onRemove,
  recentlySavedIds,
  lastCreatedId,
}: SkillTierRowProps) {
  const empty = rows.length === 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] bg-white/[0.01] min-h-[88px]">
      {/* Tier gutter */}
      <div className="px-4 py-4 sm:border-r border-white/[0.06] flex flex-col gap-1.5">
        <TierStars stars={tier.stars} />
        <span className="font-display text-text font-medium text-[15px] tracking-[-0.01em] leading-tight">
          {tier.label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-dim tabular-nums">
          {rows.length} · {tier.help}
        </span>
      </div>

      {/* Chip area */}
      <div className="px-4 py-3.5 flex flex-wrap gap-2 content-start items-start">
        {empty ? (
          <span className="text-[12.5px] text-text-dim italic self-center">
            No skills at this level yet
          </span>
        ) : (
          rows.map((row) => (
            <SkillChip
              key={row.id}
              row={row}
              tier={tier.stars}
              expanded={row.id === expandedId}
              onExpand={() => onExpand(row.id)}
              onCollapse={() => onExpand(null)}
              onPatch={(patch) => onPatch(row, patch)}
              onRemove={() => onRemove(row)}
              justSaved={recentlySavedIds.has(row.id)}
              justCreated={row.id === lastCreatedId}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillChip — collapsed pill OR expanded inline editor in the same DOM slot
// ─────────────────────────────────────────────────────────────────────────────

interface SkillChipProps {
  row: SkillRow;
  tier: ProficiencyTier;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onPatch: (patch: Partial<SkillRow>) => Promise<void>;
  onRemove: () => Promise<void>;
  justSaved: boolean;
  justCreated: boolean;
}

function SkillChip({
  row,
  tier,
  expanded,
  onExpand,
  onCollapse,
  onPatch,
  onRemove,
  justSaved,
  justCreated,
}: SkillChipProps) {
  const reduced = useReducedMotion();
  // Created wins over reorder/save when multiple animations could apply.
  const animStyle =
    !reduced && justCreated
      ? { animation: "pp-fade-up 360ms cubic-bezier(0.22,1,0.36,1)" }
      : undefined;

  if (expanded) {
    return (
      <SkillChipEditor
        row={row}
        onPatch={onPatch}
        onCollapse={onCollapse}
        onRemove={onRemove}
        animStyle={animStyle}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-white/[0.04] border border-white/10 hover:border-[rgba(196,181,253,0.40)] hover:bg-[rgba(196,181,253,0.06)] transition-colors focus:outline-none focus:border-[rgba(196,181,253,0.50)] focus:shadow-[0_0_0_4px_rgba(196,181,253,0.10)]"
      aria-label={`Edit skill ${row.name || "(unnamed)"} — tier ${tier} of 5`}
      style={animStyle}
    >
      <span className="text-[13px] text-text font-medium truncate max-w-[16ch]">
        {row.name || "(unnamed)"}
      </span>
      <span className="inline-flex gap-[2px]" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <StarGlyph key={i} filled={i <= tier} size={9} />
        ))}
      </span>
      {row.yearsUsed != null && row.yearsUsed > 0 && (
        <span className="font-mono text-[10.5px] text-text-dim tabular-nums">
          {row.yearsUsed}y
        </span>
      )}
      {justSaved && <SavedPill />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkillChipEditor — inline edit-in-place; renders in the chip's DOM slot.
// Blur-to-save: every input commits on blur. "Done" or Escape collapses.
// A11y: closes on outside mousedown AND on document focusin (keyboard tab-out).
// ─────────────────────────────────────────────────────────────────────────────

interface SkillChipEditorProps {
  row: SkillRow;
  onPatch: (patch: Partial<SkillRow>) => Promise<void>;
  onCollapse: () => void;
  onRemove: () => Promise<void>;
  animStyle?: CSSProperties;
}

function SkillChipEditor({
  row,
  onPatch,
  onCollapse,
  onRemove,
  animStyle,
}: SkillChipEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Escape key collapses the editor (a11y: equivalent to a modal's close).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCollapse();
    }
  };

  // Collapse on outside-click OR when keyboard focus leaves the editor.
  // mousedown handles pointer users; focusin handles keyboard tab-out.
  useEffect(() => {
    function onPointerDown(e: globalThis.MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onCollapse();
      }
    }
    function onFocusIn(e: FocusEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onCollapse();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [onCollapse]);

  // Prevent clicks inside the editor from bubbling to chip-area wrappers.
  const stopBubble = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={wrapperRef}
      role="group"
      aria-label={`Editing skill ${row.name || "(unnamed)"}`}
      onClick={stopBubble}
      onKeyDown={handleKeyDown}
      className="w-full sm:w-auto sm:min-w-[320px] rounded-[12px] border border-[rgba(196,181,253,0.32)] bg-black/40 p-3 space-y-3 shadow-[0_0_0_4px_rgba(196,181,253,0.08)]"
      style={animStyle}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={directionAInputClass}
            defaultValue={row.name}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === row.name) return;
              void onPatch({ name: v });
            }}
            placeholder="TypeScript"
            autoFocus
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select
            className={directionAInputClass}
            value={row.category}
            onChange={(e) =>
              void onPatch({ category: e.target.value as SkillCategory })
            }
          >
            {SKILL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SKILL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Proficiency</label>
          <ProficiencyStarPicker
            value={clampTier(row.proficiency)}
            onChange={(v) => void onPatch({ proficiency: v })}
          />
        </div>
        <div>
          <label className={labelClass}>
            Years used{" "}
            <span className="text-text-dim font-normal">(optional)</span>
          </label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="number"
            min={0}
            max={60}
            defaultValue={row.yearsUsed ?? ""}
            onBlur={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== (row.yearsUsed ?? null)) {
                void onPatch({ yearsUsed: next });
              }
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void onRemove()}
          className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11.5px] text-red-300 hover:bg-red-500/20 transition-colors"
          aria-label={`Remove skill ${row.name || "(unnamed)"}`}
        >
          Remove
        </button>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11.5px] text-text-muted hover:border-white/20 transition-colors"
          aria-label="Collapse editor"
        >
          Done
        </button>
      </div>
    </div>
  );
}
