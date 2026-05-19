"use client";

/**
 * ApplyPane — Phase 5 inline apply experience.
 *
 * Replaces the legacy full-screen `<ApplyModal>` with a card that
 * lives in the same right-pane slot as `<JobDetail>`. Business
 * logic (POST /api/applications, 402 → upgrade, validation) is
 * ported 1:1 from `apply-modal.tsx`. Only the chrome changes.
 *
 * Visual spec: see /tmp/pipeline-jobs-handoff/.../manifold-prototype.jsx
 * lines 1757-2088.
 *
 * Loading + question-fetch is OWNED BY THE PARENT (JobBoard). The
 * pane is dumb about *which* questions to render — it receives the
 * pre-filtered `unanswered` array. This keeps the pane render-only
 * and lets the parent cache the per-job questions once.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X, Zap } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { AutofillSummary } from "./autofill-summary";
import { QuestionInput } from "./question-input";
import { UpgradeModal } from "./upgrade-modal";
import { cn } from "@/lib/utils";
import type { NormalizedQuestion } from "@/lib/ats/types";
import type { JobWithCompany } from "@/types";
import type { UserProfile } from "@prisma/client";

interface ApplyPaneProps {
  job: JobWithCompany;
  profile: UserProfile;
  /** Total job questions BEFORE filtering by the matcher. Used to
   *  compute the "{N} fields auto-filled" headline. */
  totalQuestions: number;
  /** Questions the user must answer (matcher couldn't auto-fill). */
  unanswered: readonly NormalizedQuestion[];
  /** Optional `creditsRemaining` from `/api/billing/status`. When
   *  undefined the footer just hides the "{N} remaining" hint. */
  creditsRemaining?: number;
  onClose: () => void;
  onApplied: (applicationId: string, warning?: string) => void;
}

const WHY_PATTERN = /why/i;

/**
 * Pre-fill answers for any textarea question whose label matches
 * "why" — these are the open-ended free-text prompts the user wants
 * to be staged with their template rather than starting blank.
 */
function buildInitialAnswers(
  unanswered: readonly NormalizedQuestion[],
  profile: UserProfile,
): Record<string, string> {
  const template = profile.coverLetterIntro ?? profile.whyImLookingTemplate ?? "";
  if (!template) return {};
  const out: Record<string, string> = {};
  for (const q of unanswered) {
    if (q.fieldType === "textarea" && WHY_PATTERN.test(q.label)) {
      out[q.id] = template;
    }
  }
  return out;
}

export function ApplyPane({
  job,
  profile,
  totalQuestions,
  unanswered,
  creditsRemaining,
  onClose,
  onApplied,
}: ApplyPaneProps) {
  const initial = useMemo(
    () => buildInitialAnswers(unanswered, profile),
    [unanswered, profile],
  );
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditLimitResetsAt, setCreditLimitResetsAt] = useState<Date | null>(
    null,
  );

  const filledCount = Math.max(0, totalQuestions - unanswered.length);
  const template =
    profile.coverLetterIntro ?? profile.whyImLookingTemplate ?? "";

  function handleAnswerChange(fieldId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  function resetToTemplate(fieldId: string) {
    setAnswers((prev) => ({ ...prev, [fieldId]: template }));
  }

  async function submitApplication(payload: Record<string, string>) {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          additionalAnswers: payload,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: { applicationId: string; warning?: string };
        error?: string;
        resetsAt?: string;
      };

      // 402 → show the editorial UpgradeModal. Submitting stays false
      // so the apply pane is interactive again behind the modal.
      if (res.status === 402 && data.resetsAt) {
        setCreditLimitResetsAt(new Date(data.resetsAt));
        setSubmitting(false);
        return;
      }

      if (data.success && data.data) {
        onApplied(data.data.applicationId, data.data.warning);
        // Don't reset `submitting` — the parent unmounts us.
        return;
      }

      setError(data.error ?? "Failed to apply");
      setSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const missing = unanswered.filter((q) => {
      if (!q.required) return false;
      if (q.fieldType === "file") return false;
      const v = answers[q.id];
      return v === undefined || v === "";
    });

    if (missing.length > 0) {
      setError("Please answer all required questions.");
      return;
    }
    await submitApplication(answers);
  }

  // Auto-submit when there are no unanswered questions. The pane
  // still renders briefly (spinner state below) so the user sees
  // *something* between Apply click and the celebration. Guarded
  // by a ref so StrictMode's double-mount + future re-renders never
  // fire two POSTs.
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (unanswered.length !== 0) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void submitApplication({});
    // submitApplication closes over `job.id` only; stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unanswered.length]);

  return (
    <>
      <div
        data-testid="apply-pane"
        className={cn(
          "bg-bg-elev border border-[rgba(196,181,253,0.18)] rounded-[14px]",
          "overflow-hidden flex flex-col h-full",
          "shadow-[0_0_0_1px_rgba(196,181,253,0.06),0_32px_80px_-32px_rgba(99,102,241,0.4)]",
        )}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className={cn(
            "px-6 pt-[18px] pb-[18px] border-b border-white/[0.06] shrink-0",
            "bg-gradient-to-b from-[rgba(99,102,241,0.06)] to-transparent",
          )}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[10px] shrink-0 overflow-hidden bg-white/5 flex items-center justify-center text-white font-bold">
              <CompanyLogo
                name={job.company.name}
                logoUrl={job.company.logoUrl}
                website={job.company.website}
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-accent-lavender">
                Applying to
              </span>
              <h2 className="font-display font-semibold text-[17px] tracking-[-0.02em] text-text leading-[1.2] truncate">
                {job.title}
              </h2>
              <p className="text-[12px] text-text-muted truncate">
                {job.company.name}
                {job.location ? ` · ${job.location}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel application"
              className={cn(
                "inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg",
                "bg-white/[0.03] hover:bg-white/[0.07] text-text-dim hover:text-text",
                "transition-colors shrink-0",
              )}
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </div>

          <div className="mt-3">
            <AutofillSummary filledCount={filledCount} profile={profile} />
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {unanswered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="w-6 h-6 text-accent-lavender animate-spin" />
              <p className="text-sm text-text-muted">
                Filing your application…
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-5">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text">
                  Needs your input
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full font-mono text-[11px] font-medium",
                    "bg-[rgba(196,181,253,0.14)] text-accent-lavender",
                  )}
                >
                  {unanswered.length}{" "}
                  {unanswered.length === 1 ? "question" : "questions"}
                </span>
              </div>

              <div className="space-y-6">
                {unanswered.map((q) => {
                  const isWhyTextarea =
                    q.fieldType === "textarea" && WHY_PATTERN.test(q.label);
                  return (
                    <QuestionInput
                      key={q.id}
                      question={q}
                      answers={answers}
                      onChange={handleAnswerChange}
                      footerSlot={
                        isWhyTextarea && template ? (
                          <button
                            type="button"
                            onClick={() => resetToTemplate(q.id)}
                            className={cn(
                              "inline-flex items-center gap-1 text-[11.5px] font-medium",
                              "text-accent-lavender hover:text-accent-light transition-colors",
                            )}
                          >
                            <Sparkles className="w-3 h-3" />
                            Reset to template
                          </button>
                        ) : null
                      }
                    />
                  );
                })}
              </div>

              {error && (
                <div className="mt-5 rounded-[10px] bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div
          className={cn(
            "shrink-0 px-6 py-4 border-t border-white/[0.06]",
            "bg-[rgba(99,102,241,0.04)] flex items-center gap-4",
          )}
        >
          <div className="flex-1 min-w-0">
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent-lavender">
              1 credit
            </span>
            {typeof creditsRemaining === "number" && (
              <span className="text-[11.5px] text-text-muted">
                <span className="font-mono text-accent-lavender">
                  {creditsRemaining}
                </span>{" "}
                remaining this month
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || unanswered.length === 0}
            className={cn(
              "inline-flex items-center justify-center gap-2 py-3 px-6 rounded-[12px]",
              "font-display font-semibold text-[14px] transition-transform active:scale-[0.985]",
              "text-bg bg-gradient-to-b from-[#f5f4f1] to-[#e7e5e0]",
              "shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]",
              "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Filing…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Submit application
              </>
            )}
          </button>
        </div>
      </div>

      {/* 402 upgrade modal — opens above the apply pane. Closing it
          dismisses the pane entirely (the user has nothing to do here
          until they upgrade or the window resets). */}
      {creditLimitResetsAt && (
        <UpgradeModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setCreditLimitResetsAt(null);
              onClose();
            }
          }}
          resetsAt={creditLimitResetsAt}
        />
      )}

    </>
  );
}
