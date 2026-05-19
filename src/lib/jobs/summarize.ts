import Anthropic, {
  APIError,
  APIUserAbortError,
  APIConnectionError,
} from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

/**
 * Editorial TL;DR generator for job descriptions.
 *
 * Generates a 1–3 sentence summary (~30–60 words) via Claude Haiku for the
 * Browse Jobs detail pane. Called from the sync pipeline on **first ingest
 * only** — never on update — so the per-listing cost is paid once.
 *
 * Defensive contract: never throws. Returns `null` on any error (auth,
 * rate-limit, malformed response, empty input). The caller stores `null`
 * and downstream renderers treat that as "no TL;DR available, render the
 * full HTML body unchanged." A future sync that newly creates the row can
 * retry; once persisted, the summary is never re-generated.
 *
 * Uses the same Anthropic SDK + Haiku model as src/lib/ai.ts. The summary
 * is plain prose — no markdown, no bullets, no quotes — suitable for
 * dropping directly into a `<p>` element.
 */

const SUMMARIZE_MODEL = "claude-haiku-4-5-20251001";
const SUMMARIZE_MAX_TOKENS = 200; // ~150 words — comfortably covers a 60-word TL;DR
const SUMMARIZE_TIMEOUT_MS = 15_000;
const SUMMARIZE_DEFAULT_RETRY_BACKOFF_MS = 2_000;
const SUMMARIZE_MAX_RETRY_BACKOFF_MS = 10_000;

// Cap the plain-text body we send to Haiku. The model's context is generous,
// but most descriptions saturate the editorial signal well before 8k chars —
// the lead paragraph + responsibilities are what matter for a TL;DR.
const MAX_INPUT_CHARS = 8_000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[summarize] ANTHROPIC_API_KEY not set — job summarization disabled",
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

// Mirrors src/lib/ai.ts.isRetryableError — transient failures only.
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
        return Math.min(seconds * 1000, SUMMARIZE_MAX_RETRY_BACKOFF_MS);
      }
    }
  }
  return SUMMARIZE_DEFAULT_RETRY_BACKOFF_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimal HTML → plain text. Job descriptions arrive as Greenhouse/Ashby
 * HTML (decoded entities, sanitized inline styles). We don't have
 * `sanitize-html` as a dependency, so this regex pipeline:
 *   1. Drops <script>/<style> blocks entirely (content + tags)
 *   2. Turns block-level closers and <br> into newlines so the model sees
 *      paragraph boundaries
 *   3. Strips remaining tags
 *   4. Decodes the most common entity escapes
 *   5. Collapses runs of whitespace
 *
 * Intentionally minimal — we only need text good enough for Haiku to read,
 * not a perfect roundtrip.
 */
function htmlToPlainText(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  out = out
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return out.replace(/\s+/g, " ").trim();
}

const PROMPT_PREFIX = `Write a concise editorial TL;DR for the job description below.

Rules:
- 1 to 3 sentences, roughly 30 to 60 words total.
- Capture the role's core function AND the most distinctive thing about it (industry, company type, or unique requirement).
- Avoid generic phrases like "great opportunity", "fast-paced environment", "dynamic team", "exciting role".
- Plain prose only — no markdown, no bullets, no headings.
- Return ONLY the summary text. No preamble, no quotes, no "TL;DR:" label.

Job description:
`;

async function callHaikuWithRetry(prompt: string): Promise<Message | null> {
  const maxAttempts = 2; // original + 1 retry
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message: Message = await anthropic.messages.create(
        {
          model: SUMMARIZE_MODEL,
          max_tokens: SUMMARIZE_MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        },
        { signal: AbortSignal.timeout(SUMMARIZE_TIMEOUT_MS) },
      );
      return message;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableError(err);
      if (!retryable || attempt === maxAttempts) {
        console.error("[summarize] generation failed:", err);
        return null;
      }
      const backoffMs = getBackoffMs(err);
      console.warn(
        `[summarize] attempt ${attempt} failed (retryable), retrying in ${backoffMs}ms:`,
        err,
      );
      await sleep(backoffMs);
    }
  }
  console.error("[summarize] generation failed:", lastErr);
  return null;
}

/**
 * Generate an editorial TL;DR for a job description.
 *
 * @param html - The raw job description HTML as stored on `Job.content`.
 *               May be null/empty; that case returns null without an API call.
 * @returns The plain-text TL;DR (1–3 sentences) on success, or `null` on any
 *          failure mode — missing key, empty input, API error, malformed
 *          response, or output that came back empty after trimming.
 */
export async function summarizeJobDescription(
  html: string,
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!html) return null;

  const plain = htmlToPlainText(html);
  if (!plain) return null;

  const truncated =
    plain.length > MAX_INPUT_CHARS ? plain.slice(0, MAX_INPUT_CHARS) : plain;
  const prompt = `${PROMPT_PREFIX}${truncated}`;

  const message = await callHaikuWithRetry(prompt);
  if (!message) return null;

  try {
    const first = message.content[0];
    if (!first || first.type !== "text") return null;
    const summary = first.text
      // Strip a wrapping quote pair if the model added one despite instructions.
      .replace(/^["'\s]+|["'\s]+$/g, "")
      // Drop a leading "TL;DR:" / "Summary:" label if it slipped through.
      .replace(/^(tl;?dr|summary)\s*:\s*/i, "")
      .trim();
    return summary.length > 0 ? summary : null;
  } catch (err) {
    console.error("[summarize] failed to parse response:", err);
    return null;
  }
}
