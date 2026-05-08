"use client";

import type { UserProfile } from "@prisma/client";
import { toast } from "sonner";
import type { CertificationInput, ProjectInput } from "@/types";
import { gridTwoCol, inputClass, labelClass, sectionClass, sectionTitleClass } from "./_shared/styles";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";
import { ChipInput } from "./_shared/chip-input";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";

type ProjectRow = ProjectInput & { id: string };
type CertificationRow = CertificationInput & { id: string };

function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function fromDateInput(v: string): string | null {
  return v ? v : null;
}

interface Props {
  initialData: UserProfile | null;
}

export function ProjectsCertsForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);
  return (
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProjectsSection identityOk={identityOk} />
        <CertificationsSection identityOk={identityOk} />
      </div>
    </div>
  );
}

// ───────────────── Projects ─────────────────

function ProjectsSection({ identityOk }: { identityOk: boolean }) {
  const { items, loading, error, create, update, remove } =
    useChildResource<ProjectRow>("projects");

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: "New project",
        url: "",
        repoUrl: "",
        description: null,
        technologies: [],
        role: null,
        startDate: null,
        endDate: null,
        isOngoing: false,
        order: 0,
      });
    } catch {
      toast.error("Failed to add project");
    }
  };

  const handleUpdate = async (idx: number, patch: Partial<ProjectRow>) => {
    const row = items[idx];
    if (!row) return;
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save project");
    }
  };

  const handleRemove = async (idx: number) => {
    const row = items[idx];
    if (!row) return;
    try {
      await remove(row.id);
    } catch {
      toast.error("Failed to remove project");
    }
  };

  return (
    <div className={sectionClass}>
      <h2 className={sectionTitleClass}>Projects</h2>
      <p className="text-xs text-zinc-500 -mt-2">
        Side projects, open-source contributions, or notable work outside of
        full-time roles.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ListEditor<ProjectRow>
          items={items}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onItemUpdate={handleUpdate}
          addLabel="Add project"
          emptyState={<EmptyState content={EMPTY_STATES.projects} />}
          itemLabel={(item) => item.name || "(unnamed project)"}
          renderItem={(item, _index, patch) => (
            <ProjectFields item={item} patch={patch} />
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

interface ProjectFieldsProps {
  item: ProjectRow;
  patch: (p: Partial<ProjectRow>) => void;
}

function ProjectFields({ item, patch }: ProjectFieldsProps) {
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            defaultValue={item.name}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.name) patch({ name: v });
            }}
            placeholder="Open-source CLI tool"
          />
        </div>
        <div>
          <label className={labelClass}>Role</label>
          <input
            className={inputClass}
            defaultValue={item.role ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.role ?? "")) patch({ role: v || null });
            }}
            placeholder="Lead engineer"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Project URL</label>
          <input
            className={inputClass}
            type="url"
            defaultValue={item.url ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.url ?? "")) patch({ url: v || null });
            }}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={labelClass}>Repo URL</label>
          <input
            className={inputClass}
            type="url"
            defaultValue={item.repoUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.repoUrl ?? "")) patch({ repoUrl: v || null });
            }}
            placeholder="https://github.com/..."
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Technologies</label>
        <ChipInput
          value={item.technologies}
          onChange={(next) => patch({ technologies: next })}
          placeholder="TypeScript, React, Postgres..."
          maxChips={50}
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${inputClass} resize-y`}
          rows={3}
          maxLength={5000}
          defaultValue={item.description ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.description ?? ""))
              patch({ description: v || null });
          }}
          placeholder="What this project does and what you contributed..."
        />
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
              if (v !== toDateInput(item.startDate))
                patch({ startDate: fromDateInput(v) });
            }}
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input
            className={inputClass}
            type="date"
            disabled={item.isOngoing}
            defaultValue={toDateInput(item.endDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.endDate))
                patch({ endDate: fromDateInput(v) });
            }}
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={item.isOngoing}
          onChange={(e) => {
            const isOngoing = e.target.checked;
            patch(
              isOngoing
                ? { isOngoing: true, endDate: null }
                : { isOngoing: false }
            );
          }}
          className="w-4 h-4 rounded accent-white"
        />
        <span className="text-sm text-zinc-300">Ongoing</span>
      </label>
    </>
  );
}

// ───────────────── Certifications ─────────────────

function CertificationsSection({ identityOk }: { identityOk: boolean }) {
  const { items, loading, error, create, update, remove } =
    useChildResource<CertificationRow>("certifications");

  const handleAdd = async () => {
    if (!identityOk) {
      toast.error("Complete the Personal tab first");
      return;
    }
    try {
      await create({
        name: "New certification",
        issuer: "Issuer",
        issueDate: null,
        expiryDate: null,
        credentialUrl: "",
        credentialId: null,
        order: 0,
      });
    } catch {
      toast.error("Failed to add certification");
    }
  };

  const handleUpdate = async (idx: number, patch: Partial<CertificationRow>) => {
    const row = items[idx];
    if (!row) return;
    try {
      await update(row.id, patch);
    } catch {
      toast.error("Failed to save certification");
    }
  };

  const handleRemove = async (idx: number) => {
    const row = items[idx];
    if (!row) return;
    try {
      await remove(row.id);
    } catch {
      toast.error("Failed to remove certification");
    }
  };

  return (
    <div className={sectionClass}>
      <h2 className={sectionTitleClass}>Certifications</h2>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <ListEditor<CertificationRow>
          items={items}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onItemUpdate={handleUpdate}
          addLabel="Add certification"
          emptyState={<EmptyState content={EMPTY_STATES.certifications} />}
          itemLabel={(item) => item.name || "(unnamed certification)"}
          renderItem={(item, _index, patch) => (
            <CertificationFields item={item} patch={patch} />
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

interface CertificationFieldsProps {
  item: CertificationRow;
  patch: (p: Partial<CertificationRow>) => void;
}

function CertificationFields({ item, patch }: CertificationFieldsProps) {
  return (
    <>
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            defaultValue={item.name}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.name) patch({ name: v });
            }}
            placeholder="AWS Certified Solutions Architect"
          />
        </div>
        <div>
          <label className={labelClass}>Issuer</label>
          <input
            className={inputClass}
            defaultValue={item.issuer}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.issuer) patch({ issuer: v });
            }}
            placeholder="Amazon Web Services"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Issue date</label>
          <input
            className={inputClass}
            type="date"
            defaultValue={toDateInput(item.issueDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.issueDate))
                patch({ issueDate: fromDateInput(v) });
            }}
          />
        </div>
        <div>
          <label className={labelClass}>Expiry date</label>
          <input
            className={inputClass}
            type="date"
            defaultValue={toDateInput(item.expiryDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.expiryDate))
                patch({ expiryDate: fromDateInput(v) });
            }}
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Credential URL</label>
          <input
            className={inputClass}
            type="url"
            defaultValue={item.credentialUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.credentialUrl ?? ""))
                patch({ credentialUrl: v || null });
            }}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={labelClass}>Credential ID</label>
          <input
            className={inputClass}
            defaultValue={item.credentialId ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.credentialId ?? ""))
                patch({ credentialId: v || null });
            }}
            placeholder="ABC-12345"
          />
        </div>
      </div>
    </>
  );
}
