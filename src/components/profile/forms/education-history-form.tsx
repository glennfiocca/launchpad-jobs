"use client";

import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import type { EducationEntryInput } from "@/types";
import { UniversityCombobox } from "@/components/ui/university-combobox";
import type { EducationEntryUniversitySummary } from "@/app/api/profile/education-entries/_include";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// Sole renderer of the Education tab. Mirrors the Work History UX:
// list of cards with per-field onBlur autosave, no big Save button. Legacy
// scalar fields on UserProfile are migrated forward into EducationEntry rows
// by the GET handler in /api/profile/education-entries.

// API rows carry the joined University summary (see _include.ts). The form
// only needs the writable input fields plus that joined slice — extending
// EducationEntryInput keeps the optimistic-update path in useChildResource
// happy without leaking server-only columns (createdAt, profileId, etc.).
type EducationEntryRow = EducationEntryInput & {
  id: string;
  university?: EducationEntryUniversitySummary | null;
};

// Resolves the display name to show in the combobox input and in the collapsed
// row header. Prefer the joined university's canonical name when the row has a
// linked University; fall back to free-text schoolName.
function schoolDisplayName(row: EducationEntryRow): string {
  if (row.university?.name) return row.university.name;
  return row.schoolName ?? "";
}

interface Props {
  initialData: UserProfile | null;
}

export function EducationHistoryForm({ initialData }: Props) {
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
  } = useChildResource<EducationEntryRow>("education-entries");

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

  const handleUpdate = async (idx: number, patch: Partial<EducationEntryRow>) => {
    const row = items[idx];
    if (!row) return;
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save changes");
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

  return (
    <div className={sectionClass}>
      <h2 className={sectionTitleClass}>Education</h2>
      <p className="text-xs text-zinc-500 -mt-2">
        Each degree, bootcamp, or program you&apos;ve completed — listed most
        recent first.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ListEditor<EducationEntryRow>
          items={items}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onItemUpdate={handleUpdate}
          recentlySavedIds={recentlySavedIds}
          autoFocusItemId={lastCreatedId}
          onAutoFocusConsumed={consumeLastCreatedId}
          addLabel="Add school / degree"
          emptyState={<EmptyState content={EMPTY_STATES["education-entries"]} />}
          itemLabel={(item) =>
            [item.degree, item.fieldOfStudy, schoolDisplayName(item)]
              .filter(Boolean)
              .join(" · ") || "(new entry)"
          }
          renderItem={(item, _index, patch) => (
            <EducationEntryFields item={item} patch={patch} />
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

interface FieldsProps {
  item: EducationEntryRow;
  patch: (p: Partial<EducationEntryRow>) => void;
}

function EducationEntryFields({ item, patch }: FieldsProps) {
  // The combobox is the single source of truth for both linked-university and
  // free-text school name. Either branch patches BOTH fields so the row never
  // ends up with stale data on the other side (e.g. switching from a picked
  // university back to free text must clear universityId).
  const handlePickUniversity = (id: string, name: string) => {
    // Optimistically populate the joined `university` slice so the collapsed
    // header and combobox display name flip immediately to the picked name.
    // The server PUT response (with the full `university` join) reconciles
    // city/state on the next tick — see useChildResource.update.
    patch({
      universityId: id,
      schoolName: null,
      university: { id, name, city: null, state: null },
    });
  };
  const handleClearUniversity = () => {
    patch({ universityId: null, schoolName: null, university: null });
  };
  // Free-text fallback for institutions absent from the University table.
  // Empty input collapses to `null` so the row stays close to the schema's
  // optional contract — but the row-level XOR rule (universityId OR
  // schoolName) means the server will reject a save where both are null.
  const handleFreeTextSchool = (text: string) => {
    const next = text.length > 0 ? text : null;
    if (next === (item.schoolName ?? null) && !item.universityId) return;
    patch({ universityId: null, schoolName: next, university: null });
  };
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>School name</label>
          <UniversityCombobox
            value={schoolDisplayName(item)}
            universityId={item.universityId ?? undefined}
            onSelect={handlePickUniversity}
            onClear={handleClearUniversity}
            onFreeText={handleFreeTextSchool}
            placeholder="Massachusetts Institute of Technology"
          />
        </div>
        <div>
          <label className={labelClass}>Degree</label>
          <input
            className={inputClass}
            defaultValue={item.degree}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.degree) patch({ degree: v });
            }}
            placeholder="Bachelor's of Science"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Field of study</label>
          <input
            className={inputClass}
            defaultValue={item.fieldOfStudy}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.fieldOfStudy) patch({ fieldOfStudy: v });
            }}
            placeholder="Computer Science"
          />
        </div>
        <div>
          <label className={labelClass}>GPA</label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            max="5"
            defaultValue={item.gpa ?? ""}
            onBlur={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== (item.gpa ?? null)) patch({ gpa: next });
            }}
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Start year</label>
          <input
            className={inputClass}
            type="number"
            min="1900"
            max="2100"
            defaultValue={item.startYear ?? ""}
            onBlur={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== (item.startYear ?? null)) patch({ startYear: next });
            }}
          />
        </div>
        <div>
          <label className={labelClass}>End year</label>
          <input
            className={inputClass}
            type="number"
            min="1900"
            max="2100"
            defaultValue={item.endYear ?? ""}
            onBlur={(e) => {
              const raw = e.target.value;
              const next = raw === "" ? null : Number(raw);
              if (next !== (item.endYear ?? null)) patch({ endYear: next });
            }}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Honors</label>
        <input
          className={inputClass}
          defaultValue={item.honors ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.honors ?? "")) patch({ honors: v || null });
          }}
          placeholder="Cum laude, Dean's list..."
        />
      </div>

      <div>
        <label className={labelClass}>Activities</label>
        <textarea
          className={`${inputClass} resize-y`}
          rows={3}
          maxLength={5000}
          defaultValue={item.activities ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.activities ?? "")) patch({ activities: v || null });
          }}
          placeholder="Clubs, leadership, research..."
        />
      </div>
    </>
  );
}
