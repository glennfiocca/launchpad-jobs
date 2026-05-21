// Canonical shape of the structured data we extract from a resume PDF via
// Claude Haiku. This file is the single source of truth shared between the
// parser (src/lib/profile/resume-parser.ts), the API route handler
// (src/app/api/profile/resume/route.ts — Agent B), and the resume tab UI
// (src/components/profile/forms/resume-tab.tsx — Agent A). Keep this file
// dependency-light (only `zod`) so both server and client can import it.

import { z } from "zod";

/**
 * Zod schema for the JSON output Haiku returns from the extraction prompt.
 * All fields are nullable to model the "we couldn't find this in the resume"
 * case explicitly — `null` is a valid signal, not a parse error. Caps on
 * string length and array length defend against pathological model output
 * (runaway summaries, dumped CSS, etc.).
 */
export const extractedResumeSchema = z.object({
  yearsExperience: z.number().int().min(0).max(80).nullable(),
  currentTitle: z.string().min(1).max(200).nullable(),
  mostRecentCompany: z.string().min(1).max(200).nullable(),
  educationTop: z
    .object({
      school: z.string().min(1).max(200),
      degree: z.string().min(1).max(200).nullable(),
      field: z.string().min(1).max(200).nullable(),
      yearEnd: z.number().int().min(1950).max(2050).nullable(),
    })
    .nullable(),
  skills: z.array(z.string().min(1).max(80)).max(50),
  summary: z.string().max(1000).nullable(),
});

export type ExtractedResumeData = z.infer<typeof extractedResumeSchema>;

/**
 * Bumped whenever the prompt or schema changes meaningfully. The API route
 * can compare this against a future `extractVersion` column on UserProfile
 * to decide whether to re-extract on next upload. Not currently persisted
 * — added so downstream agents can wire it in without a second schema
 * migration.
 */
export const EXTRACT_VERSION = 1;

// ─── SSE contract: shared between Agent A (UI) and Agent B (route) ────────────

/**
 * Server-Sent Event payloads emitted by `POST /api/profile/resume` while it
 * processes an upload. Each stage represents an observable checkpoint in the
 * pipeline; the client renders a progress strip and surfaces `INDEXED.backfilled`
 * to tell the user which profile fields were auto-filled.
 */
export type ResumeUploadEvent =
  | { stage: "UPLOADED"; fileName: string; size: number }
  | { stage: "PARSED"; textLength: number }
  | { stage: "INDEXED"; extracted: ExtractedResumeData; backfilled: string[] }
  | { stage: "MATCHED"; matchCount: number }
  | { stage: "READY" };

/**
 * Terminal error payload — the route emits exactly one of these and then
 * closes the stream on any failure. `code` is machine-checkable so the UI
 * can render targeted retry hints; `message` is a human-friendly fallback.
 */
export type ResumeUploadError =
  | { code: "PDF_EXTRACTION_FAILED"; message: string }
  | { code: "HAIKU_CALL_FAILED"; message: string }
  | { code: "HAIKU_INVALID_OUTPUT"; message: string }
  | { code: "MATCH_QUERY_FAILED"; message: string };

export type ResumeUploadErrorCode = ResumeUploadError["code"];
