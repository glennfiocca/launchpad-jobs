import Anthropic, {
  APIError,
  APIUserAbortError,
  APIConnectionError,
} from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

import {
  extractedResumeSchema,
  type ExtractedResumeData,
  type ResumeUploadErrorCode,
} from "./resume-types";

/**
 * Parses a resume PDF into structured `ExtractedResumeData` via Claude Haiku.
 *
 * Pipeline:
 *   1. `pdf-parse` extracts plain text from the PDF buffer.
 *   2. Text is truncated to MAX_RESUME_CHARS to stay well inside Haiku's
 *      context window and keep latency predictable.
 *   3. Haiku is called with a strict JSON-output prompt.
 *   4. The response is parsed and validated against `extractedResumeSchema`.
 *   5. Validated data is returned to the API route, which can then write a
 *      JSONB snapshot and run `backfillProfileFromExtracted`.
 *
 * Failure modes are surfaced as typed `ResumeParseError` instances so the
 * SSE route can map each one to a single, machine-checkable `error.code`
 * payload without re-classifying the error.
 */

const PARSE_MODEL = "claude-haiku-4-5-20251001";
const PARSE_MAX_TOKENS = 1_200;
const PARSE_TIMEOUT_MS = 20_000;
const PARSE_DEFAULT_RETRY_BACKOFF_MS = 2_000;
const PARSE_MAX_RETRY_BACKOFF_MS = 10_000;

// Cap on plain-text resume content sent to Haiku. ~12k chars is roughly
// 3k tokens — more than enough to cover even verbose multi-page CVs while
// keeping the prompt well under the model's 200k context.
const MAX_RESUME_CHARS = 12_000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[resume-parser] ANTHROPIC_API_KEY not set — resume extraction disabled",
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

/**
 * Typed error thrown by `parseResume`. The `code` field maps 1:1 to the
 * `ResumeUploadError["code"]` union so the SSE route can pass it through
 * without translation. `cause` (Error.cause) preserves the underlying
 * exception for server-side logging without leaking it to the client.
 */
export class ResumeParseError extends Error {
  readonly code: ResumeUploadErrorCode;
  constructor(code: ResumeUploadErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ResumeParseError";
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return true;
  if (err instanceof APIConnectionError) return true;
  if (err instanceof APIError) {
    const status = err.status;
    if (typeof status !== "number") return true;
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function getBackoffMs(err: unknown): number {
  if (err instanceof APIError && err.status === 429 && err.headers) {
    const retryAfter = err.headers.get?.("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, PARSE_MAX_RETRY_BACKOFF_MS);
      }
    }
  }
  return PARSE_DEFAULT_RETRY_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The pdf-parse npm package eagerly opens a sample PDF inside its
 * `index.js` module-init path (a known long-standing bug — see the project's
 * GitHub issues). Importing it dynamically from inside a function
 * sidesteps the bundle-time crash because the module is only ever loaded
 * at request time, not at server boot. We also import the deeper
 * `pdf-parse/lib/pdf-parse.js` entry point which skips the wrapper that
 * runs the sample-file probe. A local .d.ts (src/types/pdf-parse-internal.d.ts)
 * declares the deep import's shape so we stay strict-TS clean.
 */
type PdfParseFn = (
  buffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ text: string }>;

interface PdfParseModule {
  default?: PdfParseFn;
}

async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as
    | PdfParseFn
    | PdfParseModule;
  // CJS interop: the module may surface as the function itself or as
  // `{ default: fn }` depending on bundler interop settings.
  const fn =
    typeof mod === "function"
      ? mod
      : typeof mod.default === "function"
        ? mod.default
        : null;
  if (!fn) {
    throw new Error("pdf-parse module did not export a callable function");
  }
  return fn;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = await loadPdfParse();
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch (err) {
    throw new ResumeParseError(
      "PDF_EXTRACTION_FAILED",
      "Failed to extract text from PDF",
      err,
    );
  }
}

const PROMPT_HEADER = `You are a precise resume parser. Extract structured fields from the resume text below and return ONLY a JSON object — no prose, no markdown, no code fences.

Return this exact shape (use null when a field is genuinely not present — do not guess):

{
  "yearsExperience": <integer 0-80 or null>,
  "currentTitle": <string up to 200 chars or null>,
  "mostRecentCompany": <string up to 200 chars or null>,
  "educationTop": {
    "school": <string up to 200 chars>,
    "degree": <string up to 200 chars or null>,
    "field": <string up to 200 chars or null>,
    "yearEnd": <4-digit integer year or null>
  } or null,
  "skills": [<up to 50 short canonical skill names, each up to 80 chars>],
  "summary": <one-sentence summary up to 1000 chars or null>
}

Rules:
- "currentTitle" = the most recent job title.
- "mostRecentCompany" = the company for that most recent role.
- "yearsExperience" = total professional experience in whole years (estimate if not stated explicitly).
- "educationTop" = the highest / most recent degree only.
- "skills" = canonical skill names (e.g. "Python", "TypeScript", "AWS"). Dedupe. Drop generic filler ("communication", "teamwork") unless prominent.
- "summary" = one neutral sentence describing the candidate (role + experience level + domain).
- Return ONLY the JSON object. No leading text. No trailing text. No markdown fences.

Resume text:
`;

async function callHaikuWithRetry(prompt: string): Promise<Message> {
  const maxAttempts = 2;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message: Message = await anthropic.messages.create(
        {
          model: PARSE_MODEL,
          max_tokens: PARSE_MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        },
        { signal: AbortSignal.timeout(PARSE_TIMEOUT_MS) },
      );
      return message;
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === maxAttempts) {
        throw new ResumeParseError(
          "HAIKU_CALL_FAILED",
          "Resume extraction model call failed",
          err,
        );
      }
      const backoffMs = getBackoffMs(err);
      console.warn(
        `[resume-parser] attempt ${attempt} failed (retryable), retrying in ${backoffMs}ms:`,
        err,
      );
      await sleep(backoffMs);
    }
  }
  // Unreachable — loop either returns or throws.
  throw new ResumeParseError(
    "HAIKU_CALL_FAILED",
    "Resume extraction failed after retries",
    lastErr,
  );
}

/**
 * Strips an optional ```json ... ``` fence the model may emit despite the
 * "no markdown fences" instruction. Falls back to a raw substring between
 * the first `{` and the matching final `}`.
 */
function isolateJsonObject(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new ResumeParseError(
      "HAIKU_INVALID_OUTPUT",
      "Model output did not contain a JSON object",
    );
  }
  return text.slice(start, end + 1);
}

export async function parseResume(
  buffer: Buffer,
): Promise<ExtractedResumeData> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ResumeParseError(
      "HAIKU_CALL_FAILED",
      "ANTHROPIC_API_KEY is not configured",
    );
  }

  const rawText = await extractPdfText(buffer);
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw new ResumeParseError(
      "PDF_EXTRACTION_FAILED",
      "PDF contained no extractable text",
    );
  }

  const truncated =
    trimmed.length > MAX_RESUME_CHARS
      ? trimmed.slice(0, MAX_RESUME_CHARS)
      : trimmed;

  const message = await callHaikuWithRetry(`${PROMPT_HEADER}${truncated}`);

  const first = message.content[0];
  if (!first || first.type !== "text") {
    throw new ResumeParseError(
      "HAIKU_INVALID_OUTPUT",
      "Model response did not include a text block",
    );
  }

  const jsonText = isolateJsonObject(first.text);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (err) {
    throw new ResumeParseError(
      "HAIKU_INVALID_OUTPUT",
      "Model output was not valid JSON",
      err,
    );
  }

  const validation = extractedResumeSchema.safeParse(parsedJson);
  if (!validation.success) {
    throw new ResumeParseError(
      "HAIKU_INVALID_OUTPUT",
      "Model output failed schema validation",
      validation.error,
    );
  }

  return validation.data;
}
