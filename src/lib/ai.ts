import Anthropic, { APIError, APIUserAbortError, APIConnectionError } from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { ApplicationStatus } from "@prisma/client";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY not set — AI features disabled");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export interface EmailClassificationResult {
  status: ApplicationStatus;
  confidence: number; // 0–1
  reasoning: string;
}

// Resilience knobs for the classifier — externalized so tests can reason about them.
const CLASSIFY_TIMEOUT_MS = 15_000;
const CLASSIFY_DEFAULT_RETRY_BACKOFF_MS = 2_000;
const CLASSIFY_MAX_RETRY_BACKOFF_MS = 10_000;
const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
const CLASSIFY_MAX_TOKENS = 256;

// Retryable: transient failures only.
// - 429 rate limit (honor retry-after header if present)
// - 5xx server errors
// - network errors and timeouts (AbortError surfaces as APIUserAbortError when
//   the signal aborts; connection errors surface as APIConnectionError)
// Non-retryable: 4xx (bad request, auth, etc.) — those are deterministic.
function isRetryableError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return true;
  if (err instanceof APIConnectionError) return true;
  if (err instanceof APIError) {
    const status = err.status;
    if (typeof status !== "number") return true; // SDK couldn't get a status — likely network
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  // Bare AbortError (e.g. raw signal timeout that didn't get wrapped) — treat as retryable
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

// Pull retry-after delay (seconds) from a 429 response if present. Falls back
// to the default backoff. Caps at CLASSIFY_MAX_RETRY_BACKOFF_MS to bound total wall time.
function getBackoffMs(err: unknown): number {
  if (err instanceof APIError && err.status === 429 && err.headers) {
    const retryAfter = err.headers.get?.("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds * 1000, CLASSIFY_MAX_RETRY_BACKOFF_MS);
      }
    }
  }
  return CLASSIFY_DEFAULT_RETRY_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Classify an email to determine the application status it implies
export async function classifyRecruitingEmail(
  emailSubject: string,
  emailBody: string,
  currentStatus: ApplicationStatus
): Promise<EmailClassificationResult> {
  const prompt = `You are an expert at analyzing job application emails and determining what stage of the hiring process they represent.

Current application status: ${currentStatus}

Email subject: ${emailSubject}

Email body:
${emailBody.slice(0, 3000)}

Based on this email, classify the application status. Choose the MOST APPROPRIATE status:

- APPLIED: Application was just submitted or acknowledged
- REVIEWING: Recruiter/team is reviewing the application (e.g., "we're reviewing your application", "under review")
- PHONE_SCREEN: Phone or video screen is scheduled or was requested (e.g., "schedule a call", "video interview", "30-minute chat")
- INTERVIEWING: Technical interview, panel interview, or on-site scheduled/completed (e.g., "technical interview", "interview loop", "meet the team")
- OFFER: Job offer extended (e.g., "pleased to offer", "offer letter", "compensation package")
- REJECTED: Application was declined (e.g., "not moving forward", "decided to pursue other candidates", "not a fit")
- WITHDRAWN: Candidate withdrew (only if email explicitly says they withdrew)

If the email is ambiguous or just a generic automated reply, keep the current status: ${currentStatus}

Respond with ONLY valid JSON in this exact format:
{
  "status": "STATUS_VALUE",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this status was chosen"
}`;

  // Total budget: original attempt + 1 retry. Each attempt has a 15s timeout
  // via AbortSignal, plus an optional backoff between attempts (capped). Worst
  // case is ~15s + 10s + 15s = 40s, but typical 429 backoff is 2s → ~17s max.
  const message = await callAnthropicWithRetry(prompt);
  if (!message) {
    // Fallback sentinel — preserves the existing return type. Confidence 0
    // ensures shouldUpdateStatus() returns false, so the caller leaves the
    // application's status unchanged.
    return { status: currentStatus, confidence: 0, reasoning: "Classification failed" };
  }

  try {
    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      status: string;
      confidence: number;
      reasoning: string;
    };

    // Validate status
    const validStatuses: ApplicationStatus[] = [
      "APPLIED", "REVIEWING", "PHONE_SCREEN", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN",
    ];
    if (!validStatuses.includes(parsed.status as ApplicationStatus)) {
      return { status: currentStatus, confidence: 0, reasoning: "Invalid status in AI response" };
    }

    return {
      status: parsed.status as ApplicationStatus,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    console.error("[ai] classification failed:", err);
    return { status: currentStatus, confidence: 0, reasoning: "Classification failed" };
  }
}

// Wraps anthropic.messages.create with a per-attempt 15s timeout and 1 retry
// on transient failures (429, 5xx, network/abort). Returns the SDK Message on
// success, or null if both attempts failed. Errors are logged but never thrown
// — the caller decides on a fallback.
async function callAnthropicWithRetry(prompt: string): Promise<Message | null> {
  const maxAttempts = 2; // original + 1 retry

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Explicit stream: false to disambiguate the overload — gives us Message, not Stream.
      const message: Message = await anthropic.messages.create(
        {
          model: CLASSIFY_MODEL,
          max_tokens: CLASSIFY_MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        },
        { signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS) },
      );
      return message;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === maxAttempts) {
        console.error("[ai] classification failed:", err);
        return null;
      }
      const backoffMs = getBackoffMs(err);
      console.warn(
        `[ai] classification attempt ${attempt} failed (retryable), retrying in ${backoffMs}ms:`,
        err,
      );
      await sleep(backoffMs);
    }
  }

  // Unreachable — loop either returns or throws — but TS needs a terminal.
  console.error("[ai] classification failed:", lastErr);
  return null;
}

// STATUS_PRIORITY: higher = more advanced in the process; terminal/inactive statuses are 0
const STATUS_PRIORITY: Record<ApplicationStatus, number> = {
  APPLIED: 1,
  REVIEWING: 2,
  PHONE_SCREEN: 3,
  INTERVIEWING: 4,
  OFFER: 5,
  REJECTED: 0,
  WITHDRAWN: 0,
  LISTING_REMOVED: 0,
};

// Only advance status if the AI is confident AND the new status is further in the process
// (or it's a rejection/withdrawal which are terminal)
export function shouldUpdateStatus(
  current: ApplicationStatus,
  proposed: ApplicationStatus,
  confidence: number
): boolean {
  if (confidence < 0.75) return false;
  if (proposed === current) return false;
  if (proposed === "REJECTED" || proposed === "WITHDRAWN") return true;
  return STATUS_PRIORITY[proposed] > STATUS_PRIORITY[current];
}
