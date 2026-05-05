/**
 * Audit Company.website by fetching each homepage, extracting brand
 * signals (title, og:site_name, application-name, JSON-LD), and
 * computing a fuzzy similarity vs Company.name.
 *
 * Read-only: never mutates the database. Outputs a CSV to stdout
 * sorted by ascending suspicion score (lowest similarity first).
 *
 * See Track B.1 in docs/HARDENING_PLAN.md.
 *
 * Usage:
 *   npx tsx scripts/verify-company-websites.ts
 *   npx tsx scripts/verify-company-websites.ts --top=50
 *   npx tsx scripts/verify-company-websites.ts --threshold=0.3
 *   npx tsx scripts/verify-company-websites.ts --limit=20
 *   npx tsx scripts/verify-company-websites.ts --companyId=ckabc...
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import {
  bestSignalScore,
  type Signal,
  type SignalSource,
} from "../src/lib/website-verification/score";

// ---- Config -----------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 10;
const USER_AGENT = "Launchpad-WebsiteVerifier/1.0";
// Cap parsed HTML at 1 MB — homepage signals are always in the head, so
// truncation is safe and keeps memory bounded for hostile responses.
const MAX_HTML_BYTES = 1_048_576;

// ---- CLI flags --------------------------------------------------------------

interface CliFlags {
  readonly top: number | null;
  readonly threshold: number | null;
  readonly limit: number | null;
  readonly companyId: string | null;
}

function parseFlags(argv: readonly string[]): CliFlags {
  let top: number | null = null;
  let threshold: number | null = null;
  let limit: number | null = null;
  let companyId: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--top=")) {
      const n = Number.parseInt(arg.slice("--top=".length), 10);
      if (Number.isFinite(n) && n > 0) top = n;
    } else if (arg.startsWith("--threshold=")) {
      const n = Number.parseFloat(arg.slice("--threshold=".length));
      if (Number.isFinite(n) && n >= 0 && n <= 1) threshold = n;
    } else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    } else if (arg.startsWith("--companyId=")) {
      companyId = arg.slice("--companyId=".length);
    }
  }

  return { top, threshold, limit, companyId };
}

// ---- Concurrency primitive -------------------------------------------------

/**
 * Tiny semaphore. Avoids pulling in p-limit for a one-off script.
 */
function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = (): void => {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job();
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = (): void => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(run);
      next();
    });
}

// ---- HTML fetch ------------------------------------------------------------

interface FetchResult {
  readonly status: number | null;
  readonly html: string | null;
  readonly error: string | null;
}

function classifyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // AbortSignal.timeout fires a TimeoutError DOMException.
    if (err.name === "TimeoutError" || msg.includes("aborted") || msg.includes("timeout")) {
      return "TIMEOUT";
    }
    if (msg.includes("enotfound") || msg.includes("dns")) return "DNS";
    if (msg.includes("econnrefused")) return "CONN_REFUSED";
    if (msg.includes("certificate") || msg.includes("self signed") || msg.includes("ssl")) {
      return "TLS";
    }
    if (msg.includes("socket hang up") || msg.includes("econnreset")) return "RESET";
    return err.name || "FETCH_ERROR";
  }
  return "FETCH_ERROR";
}

async function fetchHomepage(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Default redirect mode "follow" — we want the final page.
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return { status: res.status, html: null, error: String(res.status) };
    }

    // Read body but cap size. Some homepages stream MB of HTML; we
    // only need the head section, which is always near the top.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return {
        status: res.status,
        html: text.slice(0, MAX_HTML_BYTES),
        error: null,
      };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, MAX_HTML_BYTES - offset)), offset);
      offset += c.length;
      if (offset >= MAX_HTML_BYTES) break;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.subarray(0, Math.min(offset, MAX_HTML_BYTES)),
    );
    return { status: res.status, html, error: null };
  } catch (err) {
    return { status: null, html: null, error: classifyError(err) };
  }
}

// ---- Signal extraction -----------------------------------------------------

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_OG_SITE_NAME_RE =
  /<meta[^>]+property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i;
const META_OG_SITE_NAME_RE_ALT =
  /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:site_name["'][^>]*>/i;
const META_APP_NAME_RE =
  /<meta[^>]+name\s*=\s*["']application-name["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i;
const META_APP_NAME_RE_ALT =
  /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']application-name["'][^>]*>/i;
const JSON_LD_RE =
  /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, ...patterns: readonly RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const decoded = decodeHtmlEntities(m[1]);
      if (decoded) return decoded;
    }
  }
  return null;
}

/**
 * Walk a parsed JSON-LD payload and harvest plausible Organization/
 * WebSite name fields. JSON-LD bodies are often wrapped in @graph
 * arrays or are top-level arrays of nodes — handle both shapes.
 */
function harvestJsonLdNames(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) harvestJsonLdNames(child, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const name = obj["name"];
  const isInterestingType =
    type === "Organization" ||
    type === "Corporation" ||
    type === "WebSite" ||
    (Array.isArray(type) &&
      type.some((t) => t === "Organization" || t === "Corporation" || t === "WebSite"));
  if (isInterestingType && typeof name === "string" && name.trim()) {
    out.push(name.trim());
  }
  // @graph nodes
  const graph = obj["@graph"];
  if (graph) harvestJsonLdNames(graph, out);
}

function extractJsonLdName(html: string): string | null {
  const matches = html.matchAll(JSON_LD_RE);
  const names: string[] = [];
  for (const m of matches) {
    const body = m[1]?.trim();
    if (!body) continue;
    try {
      const parsed: unknown = JSON.parse(body);
      harvestJsonLdNames(parsed, names);
    } catch {
      // Skip malformed JSON-LD silently — it's common in the wild.
    }
  }
  if (names.length === 0) return null;
  // Prefer the longest plausible name (often the most descriptive).
  names.sort((a, b) => b.length - a.length);
  return names[0] ?? null;
}

function extractSignals(html: string): Signal[] {
  const signals: Signal[] = [];

  const title = firstMatch(html, TITLE_RE);
  if (title) signals.push({ source: "title", value: title });

  const ogSiteName = firstMatch(html, META_OG_SITE_NAME_RE, META_OG_SITE_NAME_RE_ALT);
  if (ogSiteName) signals.push({ source: "og:site_name", value: ogSiteName });

  const appName = firstMatch(html, META_APP_NAME_RE, META_APP_NAME_RE_ALT);
  if (appName) signals.push({ source: "application-name", value: appName });

  const jsonLdName = extractJsonLdName(html);
  if (jsonLdName) signals.push({ source: "json-ld", value: jsonLdName });

  return signals;
}

// ---- CSV output ------------------------------------------------------------

interface AuditRow {
  readonly companyId: string;
  readonly companyName: string;
  readonly website: string;
  readonly bestSignal: string | null;
  readonly signalSource: SignalSource | null;
  readonly score: number;
  readonly httpStatus: number | null;
  readonly error: string | null;
}

function csvEscape(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsv(row: AuditRow): string {
  return [
    csvEscape(row.companyId),
    csvEscape(row.companyName),
    csvEscape(row.website),
    csvEscape(row.bestSignal),
    csvEscape(row.signalSource),
    csvEscape(row.score.toFixed(4)),
    csvEscape(row.httpStatus),
    csvEscape(row.error),
  ].join(",");
}

const CSV_HEADER =
  "companyId,companyName,website,bestSignal,signalSource,score,httpStatus,error";

// ---- Audit core ------------------------------------------------------------

interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly website: string;
}

async function auditCompany(c: CompanyRow): Promise<AuditRow> {
  const fetched = await fetchHomepage(c.website);
  if (fetched.error || !fetched.html) {
    return {
      companyId: c.id,
      companyName: c.name,
      website: c.website,
      bestSignal: null,
      signalSource: null,
      score: 0,
      httpStatus: fetched.status,
      error: fetched.error,
    };
  }

  const signals = extractSignals(fetched.html);
  const best = bestSignalScore(c.name, signals);

  return {
    companyId: c.id,
    companyName: c.name,
    website: c.website,
    bestSignal: best.value,
    signalSource: best.source,
    score: best.score,
    httpStatus: fetched.status,
    error: signals.length === 0 ? "NO_SIGNALS" : null,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  const companies = await db.company.findMany({
    where: {
      website: { not: null },
      ...(flags.companyId ? { id: flags.companyId } : {}),
    },
    select: { id: true, name: true, website: true },
    orderBy: { id: "asc" },
    ...(flags.limit ? { take: flags.limit } : {}),
  });

  // The `where` filter excludes null websites but Prisma still types
  // `website` as `string | null`. Narrow at the boundary.
  const targets: CompanyRow[] = companies
    .filter((c): c is { id: string; name: string; website: string } => c.website !== null)
    .map((c) => ({ id: c.id, name: c.name, website: c.website }));

  if (targets.length === 0) {
    console.error("no companies with websites; skipping smoke");
    await db.$disconnect();
    return;
  }

  console.error(`Auditing ${targets.length} companies (concurrency=${MAX_CONCURRENCY})...`);

  const limit = createLimiter(MAX_CONCURRENCY);
  const results: AuditRow[] = await Promise.all(
    targets.map((c) => limit(() => auditCompany(c))),
  );

  results.sort((a, b) => a.score - b.score);

  let filtered: AuditRow[] = results;
  if (flags.threshold !== null) {
    const threshold = flags.threshold;
    filtered = filtered.filter((r) => r.score < threshold);
  }
  if (flags.top !== null) {
    filtered = filtered.slice(0, flags.top);
  }

  console.log(CSV_HEADER);
  for (const r of filtered) console.log(rowToCsv(r));

  console.error(`\nDone. ${filtered.length} of ${results.length} rows printed.`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await db.$disconnect();
  process.exit(1);
});
