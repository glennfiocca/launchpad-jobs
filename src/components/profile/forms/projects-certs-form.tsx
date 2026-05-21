"use client";

/**
 * ProjectsCertsForm — Direction A "Manifold" treatment.
 *
 * Paired list-editor tab. Projects on the left (wider), certifications on
 * the right (narrower). Each section is its own SectionHeader + eyebrow +
 * SavedPill, wrapped in a directionASectionClass card. Rows use the
 * enhanced ListEditor — blur-to-save, lavender focus rings, fly-in entry,
 * reorder flash, SavedPill in the row header.
 *
 * The data shape is preserved (ProjectInput / CertificationInput from
 * src/types). Field-name notes:
 *   - "GitHub URL" is the existing `repoUrl` column.
 *   - "Expiration date" is the existing `expiryDate` column.
 * The redesign brief uses different field labels but the underlying DB
 * shape stays as-is — no Prisma migration in this PR.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { UserProfile } from "@prisma/client";
import type { CertificationInput, ProjectInput } from "@/types";
import {
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
import { ChipInput } from "./_shared/chip-input";
import { EmptyState } from "./_shared/empty-state";
import { EMPTY_STATES } from "./_shared/empty-states";
import { IdentityRequiredNotice, isIdentityComplete } from "./_shared/identity-gate";
import { ListEditor } from "./_shared/list-editor";
import { useChildResource } from "./_shared/use-child-resource";

type ProjectRow = ProjectInput & { id: string };
type CertificationRow = CertificationInput & { id: string };

// Convert an API Date | ISO string to the YYYY-MM-DD value the
// <input type="date"> control wants. Empty / invalid → "".
function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// "" → null for the nullable date columns; otherwise pass through.
function fromDateInput(v: string): string | null {
  return v ? v : null;
}

interface Props {
  initialData: UserProfile | null;
}

export function ProjectsCertsForm({ initialData }: Props) {
  const identityOk = isIdentityComplete(initialData);
  return (
    // Two-column paired layout — Projects (60%) | Certifications (40%) on
    // desktop, single column on mobile. The `items-start` lets the two
    // cards size to their own content (no awkward stretched whitespace).
    <div className="space-y-6">
      <IdentityRequiredNotice initialData={initialData} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3">
          <ProjectsSection identityOk={identityOk} />
        </div>
        <div className="lg:col-span-2">
          <CertificationsSection identityOk={identityOk} />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Projects ──────────────────────────

function ProjectsSection({ identityOk }: { identityOk: boolean }) {
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
  } = useChildResource<ProjectRow>("projects");

  // The SavedPill in the section header lights up whenever ANY row in the
  // section recently saved — gives the user a single "yes, that landed"
  // signal that mirrors the per-row pill rendered by ListEditor.
  const sectionRecentlySaved = recentlySavedIds.size > 0;

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
        order: 0, // server auto-assigns when 0
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

  // Swap `order` between adjacent rows. Mirrors the work-history pattern —
  // useChildResource handles optimistic UI + rollback for both PUTs.
  const handleReorder = async (oldIdx: number, newIdx: number) => {
    if (newIdx < 0 || newIdx >= items.length) return;
    const a = items[oldIdx];
    const b = items[newIdx];
    if (!a || !b) return;
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
    // `flex flex-col h-full` + `flex-1` on the inner wrapper pins the Add
    // button to the bottom of the card, so the paired Projects and
    // Certifications Add buttons align regardless of helper-text height.
    <section className={`${directionASectionClass} flex flex-col h-full`}>
      <SectionHeader
        eyebrow={<FormEyebrow accent>portfolio · projects</FormEyebrow>}
        title="Projects"
        subtitle="Side projects, open-source contributions, or notable work outside of full-time roles. Inline edit — we save on blur."
        right={<SavedPill visible={sectionRecentlySaved} />}
      />

      <div className="flex-1 flex flex-col">
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <ListEditor<ProjectRow>
            items={items}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onItemUpdate={handleUpdate}
            recentlySavedIds={recentlySavedIds}
            autoFocusItemId={lastCreatedId}
            onAutoFocusConsumed={consumeLastCreatedId}
            lastCreatedId={lastCreatedId}
            addLabel="Add project"
            emptyState={<EmptyState content={EMPTY_STATES.projects} />}
            itemLabel={(item) => item.name || "(unnamed project)"}
            renderItem={(item, _index, patch) => (
              <ProjectFields item={item} patch={patch} />
            )}
          />
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

interface ProjectFieldsProps {
  item: ProjectRow;
  patch: (p: Partial<ProjectRow>) => void;
}

function ProjectFields({ item, patch }: ProjectFieldsProps) {
  // Local mirror of the ongoing flag so toggling it disables the end-date
  // input synchronously even before the optimistic patch reconciles.
  const isOngoing = item.isOngoing;

  return (
    <>
      {/* Title row — Bricolage display treatment for the project name so
          rows read editorially when scanned at a glance. */}
      <div>
        <label className={labelClass}>Project name</label>
        <input
          className={`${directionAInputClass} font-display text-[15.5px] tracking-[-0.01em]`}
          defaultValue={item.name}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== item.name) patch({ name: v });
          }}
          placeholder="Open-source CLI tool"
          aria-label="Project name"
        />
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Project URL</label>
          <input
            className={`${directionAInputClass} font-mono`}
            type="url"
            defaultValue={item.url ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.url ?? "")) patch({ url: v || null });
            }}
            placeholder="https://yourproject.com"
            aria-label="Project URL"
          />
        </div>
        <div>
          <label className={labelClass}>GitHub URL</label>
          <input
            className={`${directionAInputClass} font-mono`}
            type="url"
            defaultValue={item.repoUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.repoUrl ?? "")) patch({ repoUrl: v || null });
            }}
            placeholder="https://github.com/you/project"
            aria-label="GitHub URL"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${directionAInputClass} resize-y min-h-[88px]`}
          rows={3}
          maxLength={5000}
          defaultValue={item.description ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.description ?? ""))
              patch({ description: v || null });
          }}
          placeholder="What this project does and what you contributed…"
          aria-label="Project description"
        />
      </div>

      <div>
        <label className={labelClass}>Technologies</label>
        <ChipInput
          value={item.technologies}
          onChange={(next) => patch({ technologies: next })}
          placeholder="TypeScript, React, Postgres…"
          maxChips={50}
        />
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Start date</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="date"
            defaultValue={toDateInput(item.startDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.startDate))
                patch({ startDate: fromDateInput(v) });
            }}
            aria-label="Start date"
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums disabled:opacity-50 disabled:cursor-not-allowed`}
            type="date"
            disabled={isOngoing}
            defaultValue={toDateInput(item.endDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.endDate))
                patch({ endDate: fromDateInput(v) });
            }}
            aria-label="End date"
          />
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isOngoing}
          onChange={(e) => {
            const next = e.target.checked;
            patch(
              next ? { isOngoing: true, endDate: null } : { isOngoing: false }
            );
          }}
          className="w-4 h-4 rounded accent-[var(--color-accent-lavender)]"
          aria-label="Project is ongoing"
        />
        <span className="text-sm text-text-muted">Ongoing</span>
      </label>
    </>
  );
}

// ────────────────────────── Certifications ──────────────────────────

function CertificationsSection({ identityOk }: { identityOk: boolean }) {
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
  } = useChildResource<CertificationRow>("certifications");

  // Header-level pill mirrors row-level activity for a single "saved" signal.
  const sectionRecentlySaved = recentlySavedIds.size > 0;

  // Per-row count summary — surfaces in the eyebrow as "credentials · N of N".
  const summary = useMemo(() => {
    if (items.length === 0) return "credentials · empty";
    return `credentials · ${items.length} on file`;
  }, [items.length]);

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

  const handleReorder = async (oldIdx: number, newIdx: number) => {
    if (newIdx < 0 || newIdx >= items.length) return;
    const a = items[oldIdx];
    const b = items[newIdx];
    if (!a || !b) return;
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
    <section className={`${directionASectionClass} flex flex-col h-full`}>
      <SectionHeader
        eyebrow={<FormEyebrow>{summary}</FormEyebrow>}
        title="Certifications"
        subtitle="Industry credentials, licenses, and professional certifications."
        right={<SavedPill visible={sectionRecentlySaved} />}
      />

      <div className="flex-1 flex flex-col">
        {loading ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <ListEditor<CertificationRow>
            items={items}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onItemUpdate={handleUpdate}
            recentlySavedIds={recentlySavedIds}
            autoFocusItemId={lastCreatedId}
            onAutoFocusConsumed={consumeLastCreatedId}
            lastCreatedId={lastCreatedId}
            addLabel="Add certification"
            emptyState={<EmptyState content={EMPTY_STATES.certifications} />}
            itemLabel={(item) =>
              item.name && item.issuer
                ? `${item.name} · ${item.issuer}`
                : item.name || "(unnamed certification)"
            }
            renderItem={(item, _index, patch) => (
              <CertificationFields item={item} patch={patch} />
            )}
          />
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

interface CertificationFieldsProps {
  item: CertificationRow;
  patch: (p: Partial<CertificationRow>) => void;
}

function CertificationFields({ item, patch }: CertificationFieldsProps) {
  // Per the spec, hide credentialId from the redesigned UI to keep the form
  // narrow on the right-hand column. The column still exists in the DB and
  // is preserved on PUT (the patch only includes the fields rendered here).
  const [showCredentialId, setShowCredentialId] = useState(
    Boolean(item.credentialId)
  );

  return (
    <>
      {/* Paired name + issuer at the top of the row — name gets a hint of
          editorial weight (matches the project title treatment). */}
      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={`${directionAInputClass} font-display text-[15px] tracking-[-0.01em]`}
            defaultValue={item.name}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.name) patch({ name: v });
            }}
            placeholder="AWS Solutions Architect"
            aria-label="Certification name"
          />
        </div>
        <div>
          <label className={labelClass}>Issuer</label>
          <input
            className={directionAInputClass}
            defaultValue={item.issuer}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== item.issuer) patch({ issuer: v });
            }}
            placeholder="Amazon Web Services"
            aria-label="Issuer"
          />
        </div>
      </div>

      <div className={gridTwoCol}>
        <div>
          <label className={labelClass}>Issue date</label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="date"
            defaultValue={toDateInput(item.issueDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.issueDate))
                patch({ issueDate: fromDateInput(v) });
            }}
            aria-label="Issue date"
          />
        </div>
        <div>
          <label className={labelClass}>
            Expiration date{" "}
            <span className="text-text-dim font-normal">(optional)</span>
          </label>
          <input
            className={`${directionAInputClass} font-mono tabular-nums`}
            type="date"
            defaultValue={toDateInput(item.expiryDate)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(item.expiryDate))
                patch({ expiryDate: fromDateInput(v) });
            }}
            aria-label="Expiration date"
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Credential URL{" "}
          <span className="text-text-dim font-normal">(optional)</span>
        </label>
        <input
          className={`${directionAInputClass} font-mono`}
          type="url"
          defaultValue={item.credentialUrl ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.credentialUrl ?? ""))
              patch({ credentialUrl: v || null });
          }}
          placeholder="https://credential.example.com/abc"
          aria-label="Credential URL"
        />
      </div>

      {/* Credential ID is a less-common field — collapsed by default to
          keep the right-hand column scannable. Expands inline (no modal). */}
      {showCredentialId ? (
        <div>
          <label className={labelClass}>
            Credential ID{" "}
            <span className="text-text-dim font-normal">(optional)</span>
          </label>
          <input
            className={`${directionAInputClass} font-mono`}
            defaultValue={item.credentialId ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== (item.credentialId ?? ""))
                patch({ credentialId: v || null });
            }}
            placeholder="ABC-12345"
            aria-label="Credential ID"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCredentialId(true)}
          className="self-start font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-dim hover:text-[var(--color-accent-lavender)] transition-colors"
        >
          + Add credential ID
        </button>
      )}
    </>
  );
}
