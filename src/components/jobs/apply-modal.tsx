"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { getUnansweredQuestions, stripHtml } from "@/lib/greenhouse/questions";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import type { GreenhouseQuestion, GreenhouseQuestionField, JobWithCompany } from "@/types";
import type { UserProfile } from "@prisma/client";

interface ApplyModalProps {
  job: JobWithCompany;
  onClose: () => void;
  onApplied: (applicationId: string, warning?: string) => void;
}

// --- Question field renderers ---

interface FieldProps {
  field: GreenhouseQuestionField;
  value: string | number | undefined;
  onChange: (fieldName: string, value: string | number) => void;
}

function YesNoToggle({ field, value, onChange }: FieldProps) {
  const yes = field.values.find((v) => v.label.toLowerCase() === "yes");
  const no = field.values.find((v) => v.label.toLowerCase() === "no");

  const baseClass =
    "flex-1 py-2 px-4 rounded-lg border text-sm transition-colors";
  const activeClass = "bg-white text-black border-white font-medium";
  const inactiveClass =
    "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300";

  return (
    <div className="flex gap-2">
      {yes && (
        <button
          type="button"
          className={`${baseClass} ${value === yes.value ? activeClass : inactiveClass}`}
          onClick={() => onChange(field.name, yes.value)}
        >
          Yes
        </button>
      )}
      {no && (
        <button
          type="button"
          className={`${baseClass} ${value === no.value ? activeClass : inactiveClass}`}
          onClick={() => onChange(field.name, no.value)}
        >
          No
        </button>
      )}
    </div>
  );
}

function SelectField({ field, value, onChange }: FieldProps) {
  return (
    <select
      value={value !== undefined ? String(value) : ""}
      onChange={(e) => {
        const opt = field.values.find((v) => String(v.value) === e.target.value);
        if (opt !== undefined) onChange(field.name, opt.value);
      }}
      className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
    >
      <option value="">Select an option...</option>
      {field.values.map((v) => (
        <option key={v.value} value={String(v.value)}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectField({ field, value, onChange }: FieldProps) {
  // value stored as comma-separated numeric values string
  const selected = value
    ? String(value)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n))
    : [];

  const toggle = (numVal: number) => {
    const next = selected.includes(numVal)
      ? selected.filter((v) => v !== numVal)
      : [...selected, numVal];
    onChange(field.name, next.join(","));
  };

  return (
    <div className="space-y-2">
      {field.values.map((v) => (
        <label key={v.value} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(v.value)}
            onChange={() => toggle(v.value)}
            className="rounded border-white/20 accent-white"
          />
          <span className="text-sm text-zinc-400">{v.label}</span>
        </label>
      ))}
    </div>
  );
}

function isYesNo(field: GreenhouseQuestionField): boolean {
  if (field.type !== "multi_value_single_select") return false;
  if (field.values.length !== 2) return false;
  const labels = field.values.map((v) => v.label.toLowerCase());
  return labels.includes("yes") && labels.includes("no");
}

function FieldRenderer({
  field,
  value,
  onChange,
}: FieldProps) {
  if (field.type === "input_file") return null;

  if (field.type === "input_text") {
    return (
      <input
        type="text"
        value={value !== undefined ? String(value) : ""}
        onChange={(e) => onChange(field.name, e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        rows={4}
        value={value !== undefined ? String(value) : ""}
        onChange={(e) => onChange(field.name, e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 resize-y transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
      />
    );
  }

  if (field.type === "multi_value_single_select") {
    return isYesNo(field) ? (
      <YesNoToggle field={field} value={value} onChange={onChange} />
    ) : (
      <SelectField field={field} value={value} onChange={onChange} />
    );
  }

  if (field.type === "multi_value_multi_select") {
    return <MultiSelectField field={field} value={value} onChange={onChange} />;
  }

  return null;
}

function QuestionInput({
  question,
  answers,
  onChange,
}: {
  question: GreenhouseQuestion;
  answers: Record<string, string | number>;
  onChange: (fieldName: string, value: string | number) => void;
}) {
  const allFileFields =
    question.fields.length > 0 &&
    question.fields.every((f) => f.type === "input_file");

  // Optional file-only question → hide entirely
  if (allFileFields && !question.required) return null;

  const helpText = question.description ? stripHtml(question.description) : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-400">
        {question.label}
        {question.required && (
          <span className="text-red-400 ml-0.5">*</span>
        )}
      </label>
      {helpText && (
        <p className="text-xs text-zinc-600">{helpText}</p>
      )}

      {allFileFields && question.required ? (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
          <strong>{question.label}</strong> — File upload required. Attach this document directly on the Greenhouse page after the form opens.
        </div>
      ) : (
        question.fields.map((field) => (
          <FieldRenderer
            key={field.name}
            field={field}
            value={answers[field.name]}
            onChange={onChange}
          />
        ))
      )}
    </div>
  );
}

// --- Main modal ---

export function ApplyModal({ job, onClose, onApplied }: ApplyModalProps) {
  const [loading, setLoading] = useState(true);
  const [unanswered, setUnanswered] = useState<GreenhouseQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditLimitResetsAt, setCreditLimitResetsAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [questionsRes, profileRes] = await Promise.all([
          fetch(`/api/jobs/${job.id}/questions`),
          fetch("/api/profile"),
        ]);

        const questionsData = (await questionsRes.json()) as {
          success: boolean;
          data?: GreenhouseQuestion[];
        };
        const profileData = (await profileRes.json()) as {
          success: boolean;
          data?: UserProfile | null;
        };

        if (cancelled) return;

        const questions = questionsData.data ?? [];
        const profile = profileData.data;

        if (!profile) {
          setError("Could not load profile. Please try again.");
          setLoading(false);
          return;
        }

        const remaining = getUnansweredQuestions(questions, profile);
        setUnanswered(remaining);
        setLoading(false);

        // No questions needed — submit automatically
        if (remaining.length === 0) {
          await submitApplication({});
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load application details. Please try again.");
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
    // submitApplication is stable; job.id won't change mid-mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  async function submitApplication(
    additionalAnswers: Record<string, string | number>
  ) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          additionalAnswers,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: { applicationId: string; warning?: string };
        error?: string;
        resetsAt?: string;
      };

      if (res.status === 402 && data.resetsAt) {
        setCreditLimitResetsAt(new Date(data.resetsAt));
        setSubmitting(false);
        return;
      }

      if (data.success && data.data) {
        onApplied(data.data.applicationId, data.data.warning);
      } else {
        setError(data.error ?? "Failed to apply");
        setSubmitting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const handleAnswerChange = (fieldName: string, value: string | number) => {
    setAnswers((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async () => {
    // Validate required questions have answers
    const missing = unanswered.filter((q) => {
      if (!q.required) return false;
      return q.fields.some(
        (f) =>
          f.type !== "input_file" &&
          (answers[f.name] === undefined || answers[f.name] === "")
      );
    });

    if (missing.length > 0) {
      setError("Please answer all required questions.");
      return;
    }

    await submitApplication(answers);
  };

  // Credit limit hit — swap to upgrade modal
  if (creditLimitResetsAt) {
    return <UpgradeModal resetsAt={creditLimitResetsAt} onClose={onClose} />;
  }

  // Spinner state: loading initial data OR auto-submitting (no questions)
  if (loading || (submitting && unanswered.length === 0)) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-8 flex flex-col items-center gap-4 shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">
            {loading ? "Loading application details..." : "Submitting application..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/8 px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{job.title}</h2>
            <p className="text-sm text-zinc-500">{job.company.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm font-medium text-zinc-400">
            A few questions before we submit
          </p>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {unanswered.map((question) => (
            <QuestionInput
              key={question.fields[0]?.name ?? question.label}
              question={question}
              answers={answers}
              onChange={handleAnswerChange}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#0a0a0a] border-t border-white/8 px-6 py-4 rounded-b-2xl">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Application"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
