"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { getUnansweredQuestions, stripHtml } from "@/lib/greenhouse/questions";
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
    "flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors";
  const activeClass = "bg-blue-600 border-blue-600 text-white";
  const inactiveClass =
    "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";

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
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">{v.label}</span>
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

function QuestionInput({
  question,
  answers,
  onChange,
}: {
  question: GreenhouseQuestion;
  answers: Record<string, string | number>;
  onChange: (fieldName: string, value: string | number) => void;
}) {
  const field = question.fields[0];
  if (!field || field.type === "input_file") return null;

  const value = answers[field.name];
  const helpText =
    question.description ? stripHtml(question.description) : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-800">
        {question.label}
        {question.required && (
          <span className="text-red-500 ml-0.5">*</span>
        )}
      </label>
      {helpText && (
        <p className="text-xs text-slate-500">{helpText}</p>
      )}

      {field.type === "input_text" && (
        <input
          type="text"
          value={value !== undefined ? String(value) : ""}
          onChange={(e) => onChange(field.name, e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {field.type === "textarea" && (
        <textarea
          rows={4}
          value={value !== undefined ? String(value) : ""}
          onChange={(e) => onChange(field.name, e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      )}

      {field.type === "multi_value_single_select" &&
        (isYesNo(field) ? (
          <YesNoToggle field={field} value={value} onChange={onChange} />
        ) : (
          <SelectField field={field} value={value} onChange={onChange} />
        ))}

      {field.type === "multi_value_multi_select" && (
        <MultiSelectField field={field} value={value} onChange={onChange} />
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
      };

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

  // Spinner state: loading initial data OR auto-submitting (no questions)
  if (loading || (submitting && unanswered.length === 0)) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-600">
            {loading ? "Loading application details..." : "Submitting application..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 rounded-t-2xl flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{job.title}</h2>
            <p className="text-sm text-slate-500">{job.company.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm font-medium text-slate-700">
            A few questions before we submit
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
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
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 rounded-b-2xl">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
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
