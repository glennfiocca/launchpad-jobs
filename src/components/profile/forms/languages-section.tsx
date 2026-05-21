"use client";

/**
 * languages-section.tsx — Languages section for the Skills/Languages tab.
 *
 * Exported public surface: LanguagesSection only.
 * All other components are internal to this module.
 *
 * Direction A vanilla — ListEditor pattern with SectionHeader / FormEyebrow /
 * SavedPill atoms and the directionA input class.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  LANGUAGE_PROFICIENCIES,
  type LanguageProficiency,
} from "@/types/_shared/profile-enums";
import type { SpokenLanguageInput } from "@/types";
import {
  directionAInputClass,
  directionASectionClass,
  labelClass,
} from "./_shared/styles";
import { FormEyebrow, SavedPill, SectionHeader } from "./_shared/atoms";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants (languages-exclusive)
// ─────────────────────────────────────────────────────────────────────────────

type LanguageRow = SpokenLanguageInput & { id: string };

const LANGUAGE_PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  native: "Native",
  fluent: "Fluent",
  professional: "Professional",
  conversational: "Conversational",
  basic: "Basic",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (languages-exclusive)
// ─────────────────────────────────────────────────────────────────────────────

// Pick a unique placeholder name (case-insensitive) so we don't trip the
// server's @@unique([profileId, name]) constraint when the user rapidly
// clicks Add. Bounded loop to avoid theoretical infinite.
function nextLanguagePlaceholder(existing: readonly string[]): string {
  const prefix = "New language";
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
function hasLanguageNameConflict(
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

// ─────────────────────────────────────────────────────────────────────────────
// LanguagesSection — public export; Direction A vanilla ListEditor pattern.
// ─────────────────────────────────────────────────────────────────────────────

interface LanguagesSectionProps {
  identityOk: boolean;
}

export function LanguagesSection({ identityOk }: LanguagesSectionProps) {
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
        name: nextLanguagePlaceholder(items.map((l) => l.name)),
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
      hasLanguageNameConflict(items, row.id, patch.name)
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
                  hasLanguageNameConflict(items, item.id, candidate)
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

// ─────────────────────────────────────────────────────────────────────────────
// LanguageFields — row content rendered inside ListEditor.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// LanguageProficiencyPills — segmented pill control for language proficiency.
// Same lavender accent system as ProficiencyStarPicker so both sections
// feel like one cohesive tab.
// ─────────────────────────────────────────────────────────────────────────────

interface LanguageProficiencyPillsProps {
  value: LanguageProficiency;
  onChange: (v: LanguageProficiency) => void;
}

function LanguageProficiencyPills({
  value,
  onChange,
}: LanguageProficiencyPillsProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label="Language proficiency"
    >
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
