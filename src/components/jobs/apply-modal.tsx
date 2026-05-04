"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import {
  getUnansweredQuestions,
  stripHtml,
} from "@/lib/ats/question-matcher";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import type { NormalizedQuestion } from "@/lib/ats/types";
import type { QuestionMatchProfile } from "@/lib/ats/question-matcher";
import type { JobWithCompany } from "@/types";
import type { UserProfile } from "@prisma/client";

interface ApplyModalProps {
  job: JobWithCompany;
  onClose: () => void;
  onApplied: (applicationId: string, warning?: string) => void;
}

// --- Profile mapping ---

function toMatchProfile(profile: UserProfile): QuestionMatchProfile {
  return {
    linkedInUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    websiteUrl: profile.portfolioUrl,
    phone: profile.phone,
    location: profile.location,
    locationFormatted: profile.locationFormatted,
    locationState: profile.locationState,
    currentCompany: profile.currentCompany,
    currentTitle: profile.currentTitle,
    university: profile.university,
    highestDegree: profile.highestDegree,
    preferredFirstName: profile.preferredFirstName,
    sponsorshipRequired: profile.requiresSponsorship,
    workAuthorized: !!profile.workAuthorization,
    openToRemote: profile.openToRemote,
  };
}

// --- Question field renderers ---

interface FieldProps {
  question: NormalizedQuestion;
  value: string | undefined;
  onChange: (fieldId: string, value: string) => void;
}

function YesNoToggle({ question, value, onChange }: FieldProps) {
  const opts = question.options ?? [];
  const yes = opts.find((v) => v.label.toLowerCase() === "yes");
  const no = opts.find((v) => v.label.toLowerCase() === "no");

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
          onClick={() => onChange(question.id, yes.value)}
        >
          Yes
        </button>
      )}
      {no && (
        <button
          type="button"
          className={`${baseClass} ${value === no.value ? activeClass : inactiveClass}`}
          onClick={() => onChange(question.id, no.value)}
        >
          No
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
      className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
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

function isYesNo(question: NormalizedQuestion): boolean {
  if (question.fieldType !== "select") return false;
  const opts = question.options ?? [];
  if (opts.length !== 2) return false;
  const labels = opts.map((v) => v.label.toLowerCase());
  return labels.includes("yes") && labels.includes("no");
}

function BooleanToggle({ question, value, onChange }: FieldProps) {
  const baseClass =
    "flex-1 py-2 px-4 rounded-lg border text-sm transition-colors";
  const activeClass = "bg-white text-black border-white font-medium";
  const inactiveClass =
    "bg-white/5 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-300";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={`${baseClass} ${value === "true" ? activeClass : inactiveClass}`}
        onClick={() => onChange(question.id, "true")}
      >
        Yes
      </button>
      <button
        type="button"
        className={`${baseClass} ${value === "false" ? activeClass : inactiveClass}`}
        onClick={() => onChange(question.id, "false")}
      >
        No
      </button>
    </div>
  );
}

function FieldRenderer({ question, value, onChange }: FieldProps) {
  if (question.fieldType === "file") return null;

  if (question.fieldType === "boolean") {
    return <BooleanToggle question={question} value={value} onChange={onChange} />;
  }

  if (question.fieldType === "text" || question.fieldType === "email" || question.fieldType === "url" || question.fieldType === "phone" || question.fieldType === "number" || question.fieldType === "date") {
    return (
      <input
        type={question.fieldType === "number" ? "number" : question.fieldType === "date" ? "date" : "text"}
        value={value ?? ""}
        onChange={(e) => onChange(question.id, e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
      />
    );
  }

  if (question.fieldType === "textarea") {
    return (
      <textarea
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(question.id, e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 resize-y transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
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
    return <MultiSelectField question={question} value={value} onChange={onChange} />;
  }

  // Fallback: render a text input for any unhandled field type
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(question.id, e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
    />
  );
}

function QuestionInput({
  question,
  answers,
  onChange,
}: {
  question: NormalizedQuestion;
  answers: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}) {
  // File-only question that's optional → hide entirely
  if (question.fieldType === "file" && !question.required) return null;

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

      {question.fieldType === "file" && question.required ? (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
          <strong>{question.label}</strong> — File upload required. Attach this document directly on the application page after the form opens.
        </div>
      ) : (
        <FieldRenderer
          question={question}
          value={answers[question.id]}
          onChange={onChange}
        />
      )}
    </div>
  );
}

// --- Main modal ---

export function ApplyModal({ job, onClose, onApplied }: ApplyModalProps) {
  const [loading, setLoading] = useState(true);
  const [unanswered, setUnanswered] = useState<NormalizedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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
          data?: NormalizedQuestion[];
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

        const matchProfile = toMatchProfile(profile);
        const remaining = getUnansweredQuestions(questions, matchProfile);
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
    additionalAnswers: Record<string, string>
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

  const handleAnswerChange = (fieldId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    // Validate required questions have answers
    const missing = unanswered.filter((q) => {
      if (!q.required) return false;
      if (q.fieldType === "file") return false;
      return answers[q.id] === undefined || answers[q.id] === "";
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Apply to ${job.title}`}
      data-testid="apply-modal"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center"
    >
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
              key={question.id}
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
