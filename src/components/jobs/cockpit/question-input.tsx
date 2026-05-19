"use client";

/**
 * QuestionInput — Phase 5 editorial port of the form widgets from
 * the legacy `<ApplyModal>`. Same matcher contract, same onChange
 * semantics. Only the chrome changes:
 *
 *   - Labels: Bricolage display, ~15.5px, slight tracking-out for
 *     editorial weight.
 *   - Helper / description text: Geist Mono, dim.
 *   - Inputs: `bg-bg`, lavender focus glow (matches the prototype's
 *     "boxShadow: 0 0 0 4px rgba(196,181,253,0.06)").
 *   - Toggle pills (Yes/No, boolean): editorial pill chips. Active
 *     state is the white-to-bg gradient used by the primary CTA so
 *     the visual hierarchy stays consistent.
 *
 * The `FieldRenderer` is internal — outside callers only need
 * `<QuestionInput>`. Keeping the renderer split mirrors the legacy
 * structure and makes it cheap to graft new field types later.
 */

import type { NormalizedQuestion } from "@/lib/ats/types";
import { stripHtml } from "@/lib/ats/question-matcher";
import { cn } from "@/lib/utils";

// ── Shared atoms ────────────────────────────────────────────────────

const INPUT_BASE = cn(
  "w-full rounded-[12px] bg-bg px-3.5 py-2.5",
  "text-[13.5px] text-text placeholder:text-text-dim",
  "border border-border-strong",
  "transition-all duration-200",
  "focus:outline-none focus:border-[rgba(196,181,253,0.45)]",
  "focus:shadow-[0_0_0_4px_rgba(196,181,253,0.08)]",
);

const TOGGLE_BASE = cn(
  "flex-1 py-2.5 px-4 rounded-[10px] text-[13.5px]",
  "font-display transition-colors text-center",
);
const TOGGLE_ACTIVE = cn(
  "bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0] text-bg font-semibold",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
);
const TOGGLE_INACTIVE = cn(
  "bg-white/[0.04] border border-border-strong text-text-muted font-medium",
  "hover:bg-white/[0.07] hover:text-text",
);

// ── Field props ─────────────────────────────────────────────────────

interface FieldProps {
  question: NormalizedQuestion;
  value: string | undefined;
  onChange: (fieldId: string, value: string) => void;
}

function YesNoToggle({ question, value, onChange }: FieldProps) {
  const opts = question.options ?? [];
  const yes = opts.find((v) => v.label.toLowerCase() === "yes");
  const no = opts.find((v) => v.label.toLowerCase() === "no");

  return (
    <div className="flex gap-2">
      {no && (
        <button
          type="button"
          className={cn(
            TOGGLE_BASE,
            value === no.value ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
          )}
          onClick={() => onChange(question.id, no.value)}
        >
          No
        </button>
      )}
      {yes && (
        <button
          type="button"
          className={cn(
            TOGGLE_BASE,
            value === yes.value ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
          )}
          onClick={() => onChange(question.id, yes.value)}
        >
          Yes
        </button>
      )}
    </div>
  );
}

function SelectField({ question, value, onChange }: FieldProps) {
  const opts = question.options ?? [];
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const opt = opts.find((v) => v.value === e.target.value);
        if (opt !== undefined) onChange(question.id, opt.value);
      }}
      className={INPUT_BASE}
    >
      <option value="">Select an option...</option>
      {opts.map((v) => (
        <option key={v.value} value={v.value}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectField({ question, value, onChange }: FieldProps) {
  const opts = question.options ?? [];
  const selected = value ? value.split(",").map((s) => s.trim()) : [];

  const toggle = (optVal: string) => {
    const next = selected.includes(optVal)
      ? selected.filter((v) => v !== optVal)
      : [...selected, optVal];
    onChange(question.id, next.join(","));
  };

  return (
    <div className="space-y-2">
      {opts.map((v) => (
        <label
          key={v.value}
          className="flex items-center gap-2.5 cursor-pointer text-[13px] text-text-muted hover:text-text transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.includes(v.value)}
            onChange={() => toggle(v.value)}
            className="rounded border-border-strong accent-accent-lavender"
          />
          <span>{v.label}</span>
        </label>
      ))}
    </div>
  );
}

function isYesNo(question: NormalizedQuestion): boolean {
  if (question.fieldType !== "select") return false;
  const opts = question.options ?? [];
  if (opts.length !== 2) return false;
  const labels = opts.map((v) => v.label.toLowerCase());
  return labels.includes("yes") && labels.includes("no");
}

function BooleanToggle({ question, value, onChange }: FieldProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={cn(
          TOGGLE_BASE,
          value === "false" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
        )}
        onClick={() => onChange(question.id, "false")}
      >
        No
      </button>
      <button
        type="button"
        className={cn(
          TOGGLE_BASE,
          value === "true" ? TOGGLE_ACTIVE : TOGGLE_INACTIVE,
        )}
        onClick={() => onChange(question.id, "true")}
      >
        Yes
      </button>
    </div>
  );
}

function FieldRenderer({ question, value, onChange }: FieldProps) {
  if (question.fieldType === "file") return null;

  if (question.fieldType === "boolean") {
    return (
      <BooleanToggle question={question} value={value} onChange={onChange} />
    );
  }

  if (
    question.fieldType === "text" ||
    question.fieldType === "email" ||
    question.fieldType === "url" ||
    question.fieldType === "phone" ||
    question.fieldType === "number" ||
    question.fieldType === "date"
  ) {
    const inputType =
      question.fieldType === "number"
        ? "number"
        : question.fieldType === "date"
          ? "date"
          : "text";
    return (
      <input
        type={inputType}
        value={value ?? ""}
        onChange={(e) => onChange(question.id, e.target.value)}
        className={INPUT_BASE}
      />
    );
  }

  if (question.fieldType === "textarea") {
    return (
      <textarea
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(question.id, e.target.value)}
        className={cn(INPUT_BASE, "resize-y leading-[1.55]")}
      />
    );
  }

  if (question.fieldType === "select") {
    return isYesNo(question) ? (
      <YesNoToggle question={question} value={value} onChange={onChange} />
    ) : (
      <SelectField question={question} value={value} onChange={onChange} />
    );
  }

  if (question.fieldType === "multiselect") {
    return (
      <MultiSelectField question={question} value={value} onChange={onChange} />
    );
  }

  // Fallback: text input for any unhandled field type.
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(question.id, e.target.value)}
      className={INPUT_BASE}
    />
  );
}

// ── Public QuestionInput ────────────────────────────────────────────

export interface QuestionInputProps {
  question: NormalizedQuestion;
  answers: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  /**
   * Optional slot rendered immediately below the field. Used by the
   * apply pane to inject the "Reset to template" link next to the
   * "why" textareas without coupling the matcher to template logic.
   */
  footerSlot?: React.ReactNode;
}

export function QuestionInput({
  question,
  answers,
  onChange,
  footerSlot,
}: QuestionInputProps) {
  // File-only question that's optional → hide entirely (no upload
  // affordance in the editorial pane; required files surface as a
  // yellow callout instead).
  if (question.fieldType === "file" && !question.required) return null;

  const helpText = question.description ? stripHtml(question.description) : null;

  return (
    <div className="space-y-2">
      <label className="block font-display font-medium text-[15.5px] tracking-[-0.015em] text-text">
        {question.label}
        {question.required && (
          <span className="text-accent-lavender ml-1" aria-hidden>
            *
          </span>
        )}
      </label>
      {helpText && (
        <p className="font-mono text-[11px] text-text-muted leading-[1.5]">
          {helpText}
        </p>
      )}

      {question.fieldType === "file" && question.required ? (
        <div className="rounded-[10px] bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-[12.5px] text-yellow-400">
          <strong>{question.label}</strong> — File upload required. Attach
          this document directly on the application page after the form
          opens.
        </div>
      ) : (
        <FieldRenderer
          question={question}
          value={answers[question.id]}
          onChange={onChange}
        />
      )}

      {footerSlot}
    </div>
  );
}
