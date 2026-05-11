"use client";

import { useState } from "react";
import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import {
  LANGUAGE_PROFICIENCIES,
  SKILL_CATEGORIES,
  type LanguageProficiency,
  type SkillCategory,
} from "@/types/_shared/profile-enums";
import type { SkillInput, SpokenLanguageInput } from "@/types";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

type SkillRow = SkillInput & { id: string };
type LanguageRow = SpokenLanguageInput & { id: string };

// Pick a unique placeholder name (case-insensitive) so we don't trip
// the server's `@@unique([profileId, name])` constraint when the user
// rapidly clicks Add. Increments the counter until a free slot is found.
function nextPlaceholder(prefix: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase().trim()));
  let i = existing.length + 1;
  // Bound the loop to avoid theoretical infinite — 1000 is way past any
  // real-world list size and well under the maxChips/list caps.
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
  candidate: string
): boolean {
  const normalized = candidate.toLowerCase().trim();
  if (!normalized) return false;
  return rows.some(
    (r) => r.id !== ownId && r.name.toLowerCase().trim() === normalized
  );
}

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

interface Props {
  initialData: UserProfile | null;
}

export function SkillsLanguagesForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);

  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkillsSection identityOk={identityOk} />
        <LanguagesSection identityOk={identityOk} />
      </div>
    </div>
  );
}

// ───────────────── Skills ─────────────────

function SkillsSection({ identityOk }: { identityOk: boolean }) {
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

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: nextPlaceholder("New skill", items.map((s) => s.name)),
        category: "language",
        proficiency: 3,
        yearsUsed: null,
        order: 0,
      });
    } catch {
      // Surface the duplicate-name 409 explicitly.
      toast.error("Couldn't add skill — make sure the name is unique");
    }
  };

  const handleUpdate = async (idx: number, patch: Partial<SkillRow>) => {
    const row = items[idx];
    if (!row) return;
    // Pre-empt the server 409 — block name updates that collide with
    // another row (case-insensitive) so the UI can surface an inline
    // error and avoid a wasted round-trip.
    if (typeof patch.name === "string" && hasNameConflict(items, row.id, patch.name)) {
      return;
    }
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save skill");
    }
  };

  const handleRemove = async (idx: number) => {
    const row = items[idx];
    if (!row) return;
    try {
      await remove(row.id);
    } catch {
      toast.error("Failed to remove skill");
    }
  };

  return (
    <div className={sectionClass}>
      <h2 className={sectionTitleClass}>Skills</h2>
      <p className="text-xs text-zinc-500 -mt-2">
        Languages, frameworks, tools, and domains you work with.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ListEditor<SkillRow>
          items={items}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onItemUpdate={handleUpdate}
          recentlySavedIds={recentlySavedIds}
          autoFocusItemId={lastCreatedId}
          onAutoFocusConsumed={consumeLastCreatedId}
          addLabel="Add skill"
          emptyState={<EmptyState content={EMPTY_STATES.skills} />}
          itemLabel={(item) => item.name || "(unnamed skill)"}
          renderItem={(item, _index, patch) => (
            <SkillFields
              item={item}
              patch={patch}
              isDuplicate={(candidate) =>
                hasNameConflict(items, item.id, candidate)
              }
            />
          )}
        />
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface SkillFieldsProps {
  item: SkillRow;
  patch: (p: Partial<SkillRow>) => void;
  isDuplicate: (candidate: string) => boolean;
}

function SkillFields({ item, patch, isDuplicate }: SkillFieldsProps) {
  const [nameError, setNameError] = useState<string | null>(null);
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            defaultValue={item.name}
            onChange={() => {
              if (nameError) setNameError(null);
            }}
            onBlur={(e) => {
              const v = e.target.value;
              if (v === item.name) return;
              if (isDuplicate(v)) {
                setNameError("Already added");
                // Restore the previous value so the UI matches DB state.
                e.target.value = item.name;
                return;
              }
              setNameError(null);
              patch({ name: v });
            }}
            placeholder="TypeScript"
          />
          {nameError && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {nameError}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select
            className={inputClass}
            value={item.category}
            onChange={(e) =>
              patch({ category: e.target.value as SkillCategory })
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

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Proficiency</label>
          <ProficiencyStars
            value={item.proficiency}
            onChange={(v) => patch({ proficiency: v })}
          />
        </div>
        <div>
          <label className={labelClass}>Years used (optional)</label>
          <input
            className={inputClass}
            type="number"
            min="0"
            max="60"
            defaultValue={item.yearsUsed ?? ""}
            onBlur={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== (item.yearsUsed ?? null)) patch({ yearsUsed: next });
            }}
          />
        </div>
      </div>
    </>
  );
}

// 1-5 segmented control rendered as 5 toggleable star buttons. Pure CSS, no
// icon library — keeps the visual consistent with the rest of the dark theme.
function ProficiencyStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((v) => {
        const active = v <= value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-label={`Proficiency ${v} of 5`}
            aria-pressed={active}
            className={`w-9 h-9 rounded-md border text-sm transition-colors ${
              active
                ? "bg-white text-black border-white"
                : "bg-white/5 border-white/10 text-zinc-500 hover:border-white/20"
            }`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

// ───────────────── Languages ─────────────────

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

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: nextPlaceholder("New language", items.map((l) => l.name)),
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
    if (typeof patch.name === "string" && hasNameConflict(items, row.id, patch.name)) {
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
    <div className={sectionClass}>
      <h2 className={sectionTitleClass}>Languages</h2>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
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

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
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
    <div className={gridTwoCol}>
      <div>
        <label className={labelClass}>Name</label>
        <input
          className={inputClass}
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
        <select
          className={inputClass}
          value={item.proficiency}
          onChange={(e) =>
            patch({ proficiency: e.target.value as LanguageProficiency })
          }
        >
          {LANGUAGE_PROFICIENCIES.map((p) => (
            <option key={p} value={p}>
              {LANGUAGE_PROFICIENCY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
