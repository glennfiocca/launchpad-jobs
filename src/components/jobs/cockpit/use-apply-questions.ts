"use client";

/**
 * useApplyQuestions — fetch the matched-question manifest for a job
 * and resolve which questions still need user input.
 *
 * Mirrors the load logic the legacy `<ApplyModal>` ran inline. Lifted
 * to a hook so `<JobBoard>` (which now owns apply state) doesn't
 * grow another ~40 lines of fetch plumbing.
 *
 * Returns a stable result object with three states:
 *   - `phase = "idle"` — no jobId yet
 *   - `phase = "loading"` — fetch in flight
 *   - `phase = "ready"`   — data resolved (or error)
 *
 * The hook auto-aborts on `jobId` change so opening a different job's
 * apply pane mid-flight doesn't race-write stale questions.
 */

import { useEffect, useState } from "react";
import {
  getUnansweredQuestions,
  type QuestionMatchProfile,
} from "@/lib/ats/question-matcher";
import type { NormalizedQuestion } from "@/lib/ats/types";
import type { UserProfile } from "@prisma/client";

type Phase = "idle" | "loading" | "ready";

interface ReadyState {
  phase: "ready";
  questions: readonly NormalizedQuestion[];
  unanswered: readonly NormalizedQuestion[];
  error: string | null;
}

interface IdleState {
  phase: "idle";
}

interface LoadingState {
  phase: "loading";
}

export type ApplyQuestionsState = IdleState | LoadingState | ReadyState;

/** Maps a `UserProfile` row to the matcher's expected scalar profile. */
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
    noticePeriodWeeks: profile.noticePeriodWeeks,
    earliestStartDate: profile.earliestStartDate,
    hasDriversLicense: profile.hasDriversLicense,
    willingBackgroundCheck: profile.willingBackgroundCheck,
    willingDrugTest: profile.willingDrugTest,
    securityClearance: profile.securityClearance,
    searchStatus: profile.searchStatus,
    coverLetterIntro: profile.coverLetterIntro,
    whyImLookingTemplate: profile.whyImLookingTemplate,
    eligibleCountries: profile.eligibleCountries,
  };
}

/**
 * Result keyed by `jobId` — guards against stale closures when the
 * caller toggles `applyingJobId` rapidly. We don't surface this key
 * to consumers; instead the hook returns "idle" whenever the current
 * `jobId` argument doesn't match the cached result.
 */
interface CachedResult {
  jobId: string;
  questions: readonly NormalizedQuestion[];
  unanswered: readonly NormalizedQuestion[];
  error: string | null;
}

export function useApplyQuestions(
  jobId: string | null,
  profile: UserProfile | null,
): ApplyQuestionsState {
  const [result, setResult] = useState<CachedResult | null>(null);

  useEffect(() => {
    if (!jobId || !profile) return;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/questions`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as {
          success: boolean;
          data?: NormalizedQuestion[];
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!data.success || !data.data) {
          setResult({
            jobId,
            questions: [],
            unanswered: [],
            error: data.error ?? "Failed to load application questions.",
          });
          return;
        }
        const matchProfile = toMatchProfile(profile);
        const unanswered = getUnansweredQuestions(data.data, matchProfile);
        setResult({
          jobId,
          questions: data.data,
          unanswered,
          error: null,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({
          jobId,
          questions: [],
          unanswered: [],
          error: "Failed to load application questions.",
        });
      }
    })();

    return () => {
      ac.abort();
    };
  }, [jobId, profile]);

  // Derive the public state. We treat the result as ready only when
  // it matches the currently-requested `jobId`; otherwise we're either
  // idle (no fetch requested) or loading (fetch in flight for `jobId`
  // but result hasn't landed yet).
  if (!jobId || !profile) return { phase: "idle" };
  if (result && result.jobId === jobId) {
    return {
      phase: "ready",
      questions: result.questions,
      unanswered: result.unanswered,
      error: result.error,
    };
  }
  return { phase: "loading" };
}
