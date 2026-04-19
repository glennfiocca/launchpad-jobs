"use client";

import { useState } from "react";
import Link from "next/link";
import type { PendingQuestion } from "@/types";

interface Props {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  pendingQuestions: PendingQuestion[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function PendingQuestionsForm({
  applicationId,
  jobTitle,
  companyName,
  pendingQuestions,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const answers: Record<string, string> = {};
    for (const q of pendingQuestions) {
      const value = formData.get(q.fieldName);
      if (typeof value === "string" && value.trim()) {
        answers[q.fieldName] = value.trim();
      }
    }

    try {
      const res = await fetch(`/api/applications/${applicationId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Failed to save answers. Please try again.");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-white/8 bg-black px-6 lg:px-8 py-4 shrink-0">
          <h1 className="text-white text-xl font-semibold">Answers Saved</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {jobTitle} at {companyName}
          </p>
        </div>
        <div className="flex-1 p-6 lg:p-8 flex flex-col items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium">Your answers have been saved.</p>
            <p className="text-zinc-400 text-sm">
              The operator will use your answers when finalizing the submission to {companyName}.
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Back to Applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/8 bg-black px-6 lg:px-8 py-4 shrink-0">
        <h1 className="text-white text-xl font-semibold">Answer Required Questions</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {jobTitle} at {companyName}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-zinc-400 text-sm mb-6">
            The following questions could not be auto-answered from your profile. Please provide answers so your
            application can be submitted.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {pendingQuestions.map((q) => (
              <div key={q.fieldName} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
                <label className="block text-sm font-medium text-white">
                  {q.label}
                  {q.required && <span className="text-red-400 ml-1">*</span>}
                </label>

                {q.description && (
                  <p className="text-xs text-zinc-500">{stripHtml(q.description)}</p>
                )}

                {q.fieldType === "multi_value_single_select" && q.selectValues ? (
                  <select
                    name={q.fieldName}
                    required={q.required}
                    defaultValue={q.userAnswer ?? ""}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="" disabled>Select an option…</option>
                    {q.selectValues.map((opt) => (
                      <option key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : q.fieldType === "textarea" ? (
                  <textarea
                    name={q.fieldName}
                    required={q.required}
                    defaultValue={q.userAnswer ?? ""}
                    rows={4}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    name={q.fieldName}
                    required={q.required}
                    defaultValue={q.userAnswer ?? ""}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                )}
              </div>
            ))}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {loading ? "Saving…" : "Save Answers"}
              </button>
              <Link
                href="/dashboard"
                className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
