"use client";

import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
} from "@/types/_shared/profile-enums";
import type { WorkExperienceInput } from "@/types";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

// Each row is a WorkExperienceInput, plus a server-assigned `id` once persisted.
type WorkExperienceRow = WorkExperienceInput & { id: string };

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

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

interface WorkHistoryFormProps {
  initialData: UserProfile | null;
}

export function WorkHistoryForm({ initialData }: WorkHistoryFormProps) {
  const identityOk = isIdentityComplete(initialData);
  const { items, loading, error, create, update, remove } =
    useChildResource<WorkExperienceRow>("work-experience");

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

  const handleUpdate = async (idx: number, patch: Partial<WorkExperienceRow>) => {
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
    try {
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

      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>Work History</h2>
        <p className="text-xs text-zinc-500 -mt-2">
          Each role you&apos;ve held — used to autofill applications and
          highlight relevant experience.
        </p>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <ListEditor<WorkExperienceRow>
            items={items}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onItemUpdate={handleUpdate}
            addLabel="Add role"
            emptyState={<EmptyState content={EMPTY_STATES["work-experience"]} />}
            itemLabel={(item) =>
              item.company ? `${item.title} · ${item.company}` : item.title
            }
            renderItem={(item, _index, patch) => (
              <WorkExperienceFields item={item} patch={patch} />
            )}
          />
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// Row-level field group. Saves are committed onBlur-per-field via the
// `patch` callback wired to useChildResource.update (PUT /[id]).
interface WorkExperienceFieldsProps {
  item: WorkExperienceRow;
  patch: (p: Partial<WorkExperienceRow>) => void;
}

function WorkExperienceFields({ item, patch }: WorkExperienceFieldsProps) {
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            defaultValue={item.title}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.title) patch({ title: v });
            }}
            placeholder="Senior Software Engineer"
          />
        </div>
        <div>
          <label className={labelClass}>Company</label>
          <input
            className={inputClass}
            defaultValue={item.company}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.company) patch({ company: v });
            }}
            placeholder="Acme Corp"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Company URL</label>
          <input
            className={inputClass}
            type="url"
            defaultValue={item.companyUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.companyUrl ?? "")) patch({ companyUrl: v || null });
            }}
            placeholder="https://acme.com"
          />
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input
            className={inputClass}
            defaultValue={item.location ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.location ?? "")) patch({ location: v || null });
            }}
            placeholder="San Francisco, CA"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Start date</label>
          <input
            className={inputClass}
            type="date"
            defaultValue={toDateInput(item.startDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && v !== toDateInput(item.startDate)) patch({ startDate: v });
            }}
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input
            className={inputClass}
            type="date"
            disabled={item.isCurrent}
            defaultValue={toDateInput(item.endDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.endDate)) patch({ endDate: fromDateInput(v) });
            }}
          />
        </div>
      </div>

      <div className="max-w-xs">
        <label className={labelClass}>Employment type</label>
        <select
          className={inputClass}
          value={item.employmentType}
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

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={item.isCurrent}
          onChange={(e) => {
            const isCurrent = e.target.checked;
            // Clearing endDate when turning isCurrent on enforces the
            // server-side superRefine constraint client-side.
            patch(
              isCurrent
                ? { isCurrent: true, endDate: null }
                : { isCurrent: false }
            );
          }}
          className="w-4 h-4 rounded accent-white"
        />
        <span className="text-sm text-zinc-300">I currently work here</span>
      </label>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${inputClass} resize-y`}
          rows={4}
          maxLength={5000}
          defaultValue={item.description ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.description ?? ""))
              patch({ description: v || null });
          }}
          placeholder="Led a team of 4 engineers building..."
        />
      </div>
    </>
  );
}
