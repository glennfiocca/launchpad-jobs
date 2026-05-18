/**
 * Pending-question counting for the dashboard cockpit.
 *
 * When an application is in `submissionStatus === "AWAITING_OPERATOR"`, the
 * apply-time auto-fill flow could not answer every ATS question from the
 * user's profile. The unanswered entries live in
 * `application.applicationSnapshot.pendingQuestions[]` (see PendingQuestion
 * in src/types/index.ts and the writer in src/app/api/applications/route.ts).
 *
 * The Pending-Q chip in the dashboard hero counts how many *unanswered*
 * questions remain across all such applications. A question is considered
 * "answered" once `userAnswer` is a non-empty string — that's what the
 * POST /api/applications/[id]/questions handler writes back via the
 * `existing.map((q) => ...userAnswer: answer)` pattern.
 *
 * Counting is done from `applicationSnapshot` rather than a separate
 * relation because the snapshot is the canonical source of truth at
 * apply-time and nothing else stores per-question state.
 */

import type { PendingQuestion } from "@/types";

/**
 * Minimal shape we need from an Application to count pending questions.
 * Kept structural so callers can pass any Application-like row without
 * threading the full Prisma type through.
 */
interface ApplicationSubset {
  submissionStatus: string;
  applicationSnapshot: unknown;
}

/**
 * Returns the number of unanswered pending questions on this application.
 *
 * Returns 0 unless `submissionStatus === "AWAITING_OPERATOR"` — applications
 * that have already submitted or are still PENDING have nothing waiting on
 * the user.
 *
 * Safe to call with malformed snapshots: any shape mismatch short-circuits
 * to 0 (never throws), which matches the over-estimate-vs-undercount
 * tradeoff called out in the design handoff.
 */
export function countPendingQuestions(app: ApplicationSubset): number {
  if (app.submissionStatus !== "AWAITING_OPERATOR") return 0;

  const snapshot = app.applicationSnapshot;
  if (!snapshot || typeof snapshot !== "object") return 0;

  // The writer stores `pendingQuestions: PendingQuestion[]` — see
  // src/app/api/applications/route.ts and the questions POST handler.
  const raw = (snapshot as Record<string, unknown>).pendingQuestions;
  if (!Array.isArray(raw)) return 0;

  let unanswered = 0;
  for (const entry of raw as ReadonlyArray<Partial<PendingQuestion>>) {
    if (!entry || typeof entry !== "object") continue;
    const answer = entry.userAnswer;
    // Answered = non-empty string. Empty string / undefined / null all count
    // as still-pending (mirrors the questions form's required-field check).
    if (typeof answer !== "string" || answer.trim() === "") {
      unanswered += 1;
    }
  }
  return unanswered;
}
