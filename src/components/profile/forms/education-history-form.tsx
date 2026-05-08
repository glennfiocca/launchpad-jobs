"use client";

import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import type { EducationEntryInput } from "@/types";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// Multi-degree history. Sits BELOW the legacy single-degree form on the
// Education tab — the orchestrator mounts both components inside the same
// <Tabs.Content value="education">.

type EducationEntryRow = EducationEntryInput & { id: string };

interface Props {
  initialData: UserProfile | null;
}

export function EducationHistoryForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);
  const { items, loading, error, create, update, remove } =
    useChildResource<EducationEntryRow>("education-entries");

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
        fieldOfStudy: "",
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
      <h2 className={sectionTitleClass}>Additional Education</h2>
      <p className="text-xs text-zinc-500 -mt-2">
        Multiple degrees, ongoing studies, or schools beyond the primary one above.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ListEditor<EducationEntryRow>
          items={items}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onItemUpdate={handleUpdate}
          addLabel="Add school / degree"
          emptyState={<EmptyState content={EMPTY_STATES["education-entries"]} />}
          itemLabel={(item) =>
            [item.degree, item.fieldOfStudy, item.schoolName]
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
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>School name</label>
          <input
            className={inputClass}
            defaultValue={item.schoolName ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.schoolName ?? "")) patch({ schoolName: v || null });
            }}
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
