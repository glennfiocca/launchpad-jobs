"use client";

/**
 * SkillsLanguagesForm — Direction A "Manifold" with a Direction B cherry-pick.
 *
 * Paired tab: two side-by-side sections.
 *
 *  - Skills: B's tier grid ported into A's visual identity. Skills are
 *    grouped client-side by `proficiency` (1-5) and rendered as horizontal
 *    rows — Expert (5★) at top, Exposure (1★) at bottom. Each row has a
 *    mono eyebrow gutter on the left ("EXPERT · 5★") and a flex-wrap of
 *    skill chips on the right. Clicking a chip expands it INLINE inside
 *    the same row container (no modal, no portal) into a mini-editor with
 *    name / category / proficiency / yearsUsed inputs. Blurring the editor
 *    or clicking "Done" collapses back to the chip view. Changing
 *    proficiency animates the chip to the new tier row (gated by reduced
 *    motion). The grid is a VIEW LAYER — the underlying data is the same
 *    flat list of Skill rows persisted by useChildResource("skills").
 *
 *  - Languages: Direction A vanilla — ListEditor pattern with the new
 *    SectionHeader / FormEyebrow / SavedPill atoms and the directionA
 *    input class. Smaller, simpler.
 *
 * Hard contracts preserved:
 *   - Blur-to-save (no Save buttons on rows).
 *   - No modals — inline edit-in-place only.
 *   - TypeScript strict, no `any`.
 *   - All colors from @theme tokens (lavender stars, etc.).
 *   - tabular-nums on numeric displays.
 *   - All framer-motion animations gated on useReducedMotion().
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
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import { useReducedMotion } from "framer-motion";
import {
  LANGUAGE_PROFICIENCIES,
  SKILL_CATEGORIES,
  type LanguageProficiency,
  type SkillCategory,
} from "@/types/_shared/profile-enums";
import type { SkillInput, SpokenLanguageInput } from "@/types";
import {
  directionAInputClass,
  directionASectionClass,
  labelClass,
  addRowBtnClass,
} from "./_shared/styles";
import { FormEyebrow, SavedPill, SectionHeader } from "./_shared/atoms";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

type SkillRow = SkillInput & { id: string };
type LanguageRow = SpokenLanguageInput & { id: string };

type ProficiencyTier = 1 | 2 | 3 | 4 | 5;

interface TierDescriptor {
  readonly stars: ProficiencyTier;
  readonly label: string;
  readonly help: string;
}

// Top-to-bottom: 5★ Expert → 1★ Exposure. Order is the display order in the
// tier grid. Labels follow B's prototype phrasing.
const TIERS: ReadonlyArray<TierDescriptor> = [
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

const LANGUAGE_PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  native: "Native",
  fluent: "Fluent",
  professional: "Professional",
  conversational: "Conversational",
  basic: "Basic",
};

// New skills default to "Working" (3★) per spec.
const DEFAULT_NEW_SKILL_TIER: ProficiencyTier = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Pick a unique placeholder name (case-insensitive) so we don't trip the
// server's @@unique([profileId, name]) constraint when the user rapidly
// clicks Add. Bounded loop to avoid theoretical infinite.
function nextPlaceholder(prefix: string, existing: readonly string[]): string {
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
function hasNameConflict(
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
  for (const tier of TIERS) map.set(tier.stars, []);
  for (const skill of skills) {
    const tier = clampTier(skill.proficiency);
    const bucket = map.get(tier);
    if (bucket) bucket.push(skill);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level form
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  initialData: UserProfile | null;
}

export function SkillsLanguagesForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      {/* Desktop: 5-col grid → Skills span-3 (~60%) | Languages span-2 (~40%).
          Mobile: stack. The intra-column hairline between sections is
          realized through each card's own border + gap-6. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <SkillsSection identityOk={identityOk} />
        </div>
        <div className="lg:col-span-2">
          <LanguagesSection identityOk={identityOk} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills section — Direction B tier grid in Direction A clothing
// ─────────────────────────────────────────────────────────────────────────────

interface SkillsSectionProps {
  identityOk: boolean;
}

function SkillsSection({ identityOk }: SkillsSectionProps) {
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
  // editor (matches ListEditor's auto-focus contract for the other list
  // tabs). Uses React's official "adjusting state on prop change" pattern:
  // a `lastSeenCreatedId` state field gates a single setState during render
  // so we don't need a useEffect cascade.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastSeenCreatedId, setLastSeenCreatedId] = useState<string | null>(null);
  if (lastCreatedId && lastCreatedId !== lastSeenCreatedId) {
    setLastSeenCreatedId(lastCreatedId);
    setExpandedId(lastCreatedId);
    // Tell the resource hook it can drop the marker — the auto-expand
    // edge has already fired in the same render pass.
    consumeLastCreatedId();
  }

  // Track which skill ids were saved within the last ~2s so the header
  // pill can flash. (`recentlySavedIds` from the hook is per-row; the
  // section pill reflects "any row just saved" — derived below.)
  const sectionRecentlySaved = recentlySavedIds.size > 0;

  const grouped = useMemo(() => groupByTier(items), [items]);

  const handleAdd = async (tier: ProficiencyTier = DEFAULT_NEW_SKILL_TIER) => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: nextPlaceholder(
          "New skill",
          items.map((s) => s.name),
        ),
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
      hasNameConflict(items, row.id, patch.name)
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
// Tier grid — 5 rows of chips
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
      {TIERS.map((tier) => {
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

// Small star indicator used on the tier gutter and the chip pill. Filled
// stars use lavender at full opacity, empty stars use the same lavender at
// 12% opacity — keeps a single accent color (per @theme contract).
function TierStars({ stars }: { stars: ProficiencyTier }) {
  return (
    <div
      className="inline-flex gap-[2px]"
      aria-label={`Tier ${stars} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <StarGlyph key={i} filled={i <= stars} size={11} />
      ))}
    </div>
  );
}

// Pure-SVG star — keeps the dark theme cohesive (no icon library import).
function StarGlyph({
  filled,
  size = 10,
}: {
  filled: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        color: "var(--color-accent-lavender)",
        opacity: filled ? 1 : 0.18,
      }}
    >
      <path
        d="M8 1.5l1.92 4.36 4.74.49-3.55 3.18 1.01 4.66L8 11.86l-4.12 2.33 1.01-4.66L1.34 6.35l4.74-.49L8 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill chip — collapsed pill OR expanded inline editor in the same DOM slot
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
  // Use a single animation per render — created wins over reorder/save.
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
      // Direction A pill / chip surface — lavender focus ring matches inputs.
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

// Inline edit-in-place — renders in the same DOM slot the chip occupies.
// Blur-to-save: every input commits on blur. "Done" button collapses;
// pressing Escape also collapses. No modal portal anywhere.
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

  // Escape key collapses the editor (a11y nicety — equivalent to a modal's
  // close affordance without actually being a modal).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCollapse();
    }
  };

  // Collapse on outside-click. Container-level blur handlers fire too
  // eagerly when focus moves between inputs inside the editor; a
  // document-level mousedown is the cleaner signal.
  useEffect(() => {
    const onDocMouseDown = (ev: globalThis.MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(ev.target as Node)) return;
      onCollapse();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onCollapse]);

  // Stop a click inside the editor from bubbling out to the chip-area
  // wrappers (which might re-trigger expand) without preventing the
  // child inputs from working normally.
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
      // Direction A expanded surface — same hairline / radius as section cards.
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

// 1-5 segmented star picker — buttons rendered in Direction A's pill style,
// active stars filled in lavender. Re-used by the chip editor.
function ProficiencyStarPicker({
  value,
  onChange,
}: {
  value: ProficiencyTier;
  onChange: (v: ProficiencyTier) => void;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Proficiency tier">
      {[1, 2, 3, 4, 5].map((v) => {
        const active = v <= value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v as ProficiencyTier)}
            aria-label={`Tier ${v} of 5`}
            aria-pressed={v === value}
            className={`w-8 h-8 rounded-[8px] border transition-colors flex items-center justify-center ${
              active
                ? "bg-[rgba(196,181,253,0.12)] border-[rgba(196,181,253,0.40)]"
                : "bg-white/5 border-white/10 hover:border-white/20"
            }`}
          >
            <StarGlyph filled={active} size={12} />
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Languages section — Direction A vanilla, standard ListEditor pattern
// ─────────────────────────────────────────────────────────────────────────────

function LanguagesSection({ identityOk }: { identityOk: boolean }) {
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
  } = useChildResource<LanguageRow>("languages");

  const sectionRecentlySaved = recentlySavedIds.size > 0;

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: nextPlaceholder(
          "New language",
          items.map((l) => l.name),
        ),
        proficiency: "professional",
        order: 0,
      });
    } catch {
      toast.error("Couldn't add language — make sure the name is unique");
    }
  };

  const handleUpdate = async (idx: number, patch: Partial<LanguageRow>) => {
    const row = items[idx];
    if (!row) return;
    if (
      typeof patch.name === "string" &&
      hasNameConflict(items, row.id, patch.name)
    ) {
      return;
    }
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save language");
    }
  };

  const handleRemove = async (idx: number) => {
    const row = items[idx];
    if (!row) return;
    try {
      await remove(row.id);
    } catch {
      toast.error("Failed to remove language");
    }
  };

  return (
    <section className={`${directionASectionClass} flex flex-col h-full`}>
      <SectionHeader
        eyebrow={<FormEyebrow>languages · spoken</FormEyebrow>}
        title="Languages you speak"
        subtitle="Used by hiring teams that filter for working-language overlap."
        right={<SavedPill visible={sectionRecentlySaved} />}
      />

      <div className="flex-1 flex flex-col">
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <ListEditor<LanguageRow>
            items={items}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onItemUpdate={handleUpdate}
            recentlySavedIds={recentlySavedIds}
            autoFocusItemId={lastCreatedId}
            onAutoFocusConsumed={consumeLastCreatedId}
            addLabel="Add language"
            emptyState={<EmptyState content={EMPTY_STATES.languages} />}
            itemLabel={(item) => item.name || "(unnamed language)"}
            renderItem={(item, _index, patch) => (
              <LanguageFields
                item={item}
                patch={patch}
                isDuplicate={(candidate) =>
                  hasNameConflict(items, item.id, candidate)
                }
              />
            )}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

interface LanguageFieldsProps {
  item: LanguageRow;
  patch: (p: Partial<LanguageRow>) => void;
  isDuplicate: (candidate: string) => boolean;
}

function LanguageFields({ item, patch, isDuplicate }: LanguageFieldsProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Name</label>
        <input
          className={directionAInputClass}
          defaultValue={item.name}
          onChange={() => {
            if (nameError) setNameError(null);
          }}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === item.name) return;
            if (isDuplicate(v)) {
              setNameError("Already added");
              e.target.value = item.name;
              return;
            }
            setNameError(null);
            patch({ name: v });
          }}
          placeholder="Spanish"
        />
        {nameError && (
          <p className="mt-1 text-xs text-red-400" role="alert">
            {nameError}
          </p>
        )}
      </div>
      <div>
        <label className={labelClass}>Proficiency</label>
        <LanguageProficiencyPills
          value={item.proficiency}
          onChange={(p) => patch({ proficiency: p })}
        />
      </div>
    </div>
  );
}

// Segmented pill control for language proficiency — same lavender accent
// system as the skill star picker so the two sections feel like one tab.
function LanguageProficiencyPills({
  value,
  onChange,
}: {
  value: LanguageProficiency;
  onChange: (v: LanguageProficiency) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Language proficiency">
      {LANGUAGE_PROFICIENCIES.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={active}
            className={`rounded-[10px] px-3 py-1.5 text-[12.5px] border transition-colors ${
              active
                ? "bg-[rgba(196,181,253,0.12)] text-[var(--color-accent-lavender)] border-[rgba(196,181,253,0.32)] font-semibold"
                : "bg-white/5 text-text-muted border-white/10 hover:border-white/20 font-medium"
            }`}
          >
            {LANGUAGE_PROFICIENCY_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
