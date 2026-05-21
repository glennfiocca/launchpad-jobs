"use client";

/**
 * ResumeForm — Direction A "indexed-artifact" treatment (PR2).
 *
 * Lifecycle states (rendered exclusively, no modals):
 *  - empty     → lavender dashed dropzone, click or drag-and-drop a PDF
 *  - uploading → indexed-artifact card with a live 5-stage parse strip
 *                driven by SSE events from POST /api/profile/resume
 *  - final     → indexed-artifact card (all stages done) + 4 stat tiles
 *                derived from the persisted resumeExtracted snapshot
 *  - error     → indexed-artifact card with the failed stage in red +
 *                inline retry guidance from the SSE error code
 *
 * The SSE contract is the source of truth — see PR2-PATTERN.md and the
 * ResumeUploadEvent / ResumeUploadError unions in resume-types.ts. We
 * consume the stream via fetch + ReadableStream (EventSource can't POST
 * multipart). All in-flight requests are torn down via AbortController on
 * unmount, on Cancel, and on error.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@prisma/client";
import { useReducedMotion } from "framer-motion";
import { AlertCircle, FileText, Upload, X } from "lucide-react";
import {
  type ExtractedResumeData,
  type ResumeUploadError,
  type ResumeUploadErrorCode,
  type ResumeUploadEvent,
} from "@/lib/profile/resume-types";
import {
  directionASectionClass,
  ghostBtnClass,
} from "./_shared/styles";
import {
  FormEyebrow,
  PulseDot,
  SectionHeader,
} from "./_shared/atoms";

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const ACCEPT_MIME = "application/pdf";
const STAGE_ORDER = ["UPLOADED", "PARSED", "INDEXED", "MATCHED", "READY"] as const;
type StageName = (typeof STAGE_ORDER)[number];

// Human-readable column labels for the INDEXED.backfilled list. The server
// emits raw column names (e.g. "currentTitle", "yearsExperience"); we map
// to friendlier copy here so the user sees what was auto-filled.
const BACKFILL_LABELS: Readonly<Record<string, string>> = {
  yearsExperience: "years experience",
  currentTitle: "current title",
  mostRecentCompany: "most recent company",
  educationTop: "education",
  skills: "skills",
  summary: "summary",
};

// Per-code recovery copy for the SSE terminal error event. Keep terse —
// the message field from the server already carries the technical detail.
const ERROR_RECOVERY: Readonly<Record<ResumeUploadErrorCode, string>> = {
  PDF_EXTRACTION_FAILED:
    "We couldn't read this PDF. Try re-exporting as a standard (unencrypted) PDF.",
  HAIKU_CALL_FAILED:
    "Your file was saved, but extraction hit a network error. You can re-parse it below.",
  HAIKU_INVALID_OUTPUT:
    "Your file was saved, but we couldn't structure the contents. Fill the rest of your profile manually.",
  MATCH_QUERY_FAILED:
    "Your file was indexed — the match counter is temporarily unavailable.",
};

// ── Types ──────────────────────────────────────────────────────────────────

// Bridge type — the generated Prisma client doesn't always reflect new JSON
// columns (resumeExtracted / resumeExtractedAt) until the next generate.
type ProfileWithResume =
  | (UserProfile & {
      resumeExtracted?: ExtractedResumeData | null;
      resumeExtractedAt?: Date | string | null;
    })
  | null;

type PillState = "done" | "active" | "pending" | "error";

interface PipelineState {
  // Map of stage -> visual pill state. Mutated as SSE events arrive.
  pills: Readonly<Record<StageName, PillState>>;
  // Snapshot of the most recent INDEXED event's extracted payload.
  extracted: ExtractedResumeData | null;
  // Column names the server auto-filled into UserProfile scalars.
  backfilled: ReadonlyArray<string>;
  // Optional final match count from the MATCHED stage.
  matchCount: number | null;
}

const EMPTY_PIPELINE: PipelineState = {
  pills: {
    UPLOADED: "pending",
    PARSED: "pending",
    INDEXED: "pending",
    MATCHED: "pending",
    READY: "pending",
  },
  extracted: null,
  backfilled: [],
  matchCount: null,
};

// Pipeline where the file is on disk but the extraction pass never ran
// (legacy uploads predating PR2). Lets the user trigger Re-extract.
const LEGACY_PIPELINE: PipelineState = {
  ...EMPTY_PIPELINE,
  pills: {
    UPLOADED: "done",
    PARSED: "pending",
    INDEXED: "pending",
    MATCHED: "pending",
    READY: "pending",
  },
};

// Pipeline reflecting a fully-parsed snapshot loaded from initialData.
function pipelineFromSnapshot(
  extracted: ExtractedResumeData,
  matchCount: number | null = null,
): PipelineState {
  return {
    pills: {
      UPLOADED: "done",
      PARSED: "done",
      INDEXED: "done",
      MATCHED: "done",
      READY: "done",
    },
    extracted,
    backfilled: [],
    matchCount,
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(when: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - when.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(value: string, max = 36): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Type guards for the discriminated unions. The SSE stream is parsed JSON
// at runtime so we narrow before consuming. Defensive but cheap.
function isUploadEvent(value: unknown): value is ResumeUploadEvent {
  if (typeof value !== "object" || value === null) return false;
  const stage = (value as { stage?: unknown }).stage;
  return (
    typeof stage === "string" &&
    (STAGE_ORDER as ReadonlyArray<string>).includes(stage)
  );
}

function isUploadError(value: unknown): value is ResumeUploadError {
  if (typeof value !== "object" || value === null) return false;
  const code = (value as { code?: unknown }).code;
  return (
    typeof code === "string" &&
    code in ERROR_RECOVERY
  );
}

// Parse one SSE message ("event: <name>\ndata: <json>\n") into a tagged
// payload, or null if the message is malformed / a heartbeat / a keep-alive.
type ParsedSSE =
  | { kind: "event"; payload: ResumeUploadEvent }
  | { kind: "error"; payload: ResumeUploadError }
  | null;

function parseSSEMessage(raw: string): ParsedSSE {
  const lines = raw.split("\n");
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  if (eventName === "stage" && isUploadEvent(json)) {
    return { kind: "event", payload: json };
  }
  if (eventName === "error" && isUploadError(json)) {
    return { kind: "error", payload: json };
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

interface ResumeFormProps {
  initialData: UserProfile | null;
}

export function ResumeForm({ initialData }: ResumeFormProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const initial = initialData as ProfileWithResume;
  const initialHasFile = Boolean(
    initial?.resumeUrl?.startsWith("https://") || initial?.resumeData,
  );
  const initialExtracted = (initial?.resumeExtracted ?? null) as
    | ExtractedResumeData
    | null;
  const initialExtractedAt = initial?.resumeExtractedAt
    ? new Date(initial.resumeExtractedAt)
    : null;

  const [fileName, setFileName] = useState<string>(
    initial?.resumeFileName ?? "",
  );
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [lastTouched, setLastTouched] = useState<Date | null>(
    initialExtractedAt,
  );

  // Initial render state derives from server-loaded data:
  //  - no file        → empty pipeline (dropzone)
  //  - file + parse   → full done pipeline
  //  - file, no parse → UPLOADED done, rest pending (Re-extract affordance)
  const [pipeline, setPipeline] = useState<PipelineState>(() => {
    if (!initialHasFile) return EMPTY_PIPELINE;
    if (initialExtracted) return pipelineFromSnapshot(initialExtracted);
    return LEGACY_PIPELINE;
  });
  const [hasFile, setHasFile] = useState<boolean>(initialHasFile);

  const [error, setError] = useState<ResumeUploadError | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Tick the relative timestamp every 30s so "last touched Xs ago" stays
  // fresh while the user lingers on the tab.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastTouched) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [lastTouched]);

  // Abort any in-flight SSE stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── SSE driver ───────────────────────────────────────────────────────────

  const applyEvent = useCallback((evt: ResumeUploadEvent) => {
    setPipeline((prev) => {
      // Mark the incoming stage done; the next stage in order becomes active.
      const idx = STAGE_ORDER.indexOf(evt.stage);
      const nextPills = { ...prev.pills };
      for (let i = 0; i <= idx; i++) nextPills[STAGE_ORDER[i]] = "done";
      const next = STAGE_ORDER[idx + 1];
      if (next) nextPills[next] = "active";

      let extracted = prev.extracted;
      let backfilled = prev.backfilled;
      let matchCount = prev.matchCount;

      if (evt.stage === "INDEXED") {
        extracted = evt.extracted;
        backfilled = evt.backfilled;
      } else if (evt.stage === "MATCHED") {
        matchCount = evt.matchCount;
      }

      return {
        pills: nextPills,
        extracted,
        backfilled,
        matchCount,
      };
    });

    if (evt.stage === "UPLOADED") {
      setFileName(evt.fileName);
      setFileSize(evt.size);
    }
    if (evt.stage === "READY") {
      setLastTouched(new Date());
      setIsStreaming(false);
      router.refresh();
    }
  }, [router]);

  const applyError = useCallback((err: ResumeUploadError) => {
    setError(err);
    setPipeline((prev) => {
      // Mark whichever stage was active when the error fired as "error".
      const nextPills = { ...prev.pills };
      const activeStage = STAGE_ORDER.find((s) => nextPills[s] === "active");
      if (activeStage) nextPills[activeStage] = "error";
      return { ...prev, pills: nextPills };
    });
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    async (body: BodyInit | null) => {
      // Cancel any prior stream before kicking off a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setValidationError(null);
      setIsStreaming(true);
      // Reset to a "UPLOADED active, rest pending" pipeline so the user sees
      // the strip light up immediately rather than after the first SSE frame.
      setPipeline({
        ...EMPTY_PIPELINE,
        pills: {
          UPLOADED: "active",
          PARSED: "pending",
          INDEXED: "pending",
          MATCHED: "pending",
          READY: "pending",
        },
      });

      try {
        const res = await fetch("/api/profile/resume", {
          method: "POST",
          body,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // Server returned a one-shot JSON error (e.g. 413, 415, 401).
          let message = `Upload failed (${res.status})`;
          try {
            const json = (await res.json()) as { error?: string };
            if (json?.error) message = json.error;
          } catch {
            // Non-JSON body; keep the default.
          }
          applyError({ code: "PDF_EXTRACTION_FAILED", message });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // SSE messages are \n\n-delimited. The last chunk may be partial.
          const messages = buf.split("\n\n");
          buf = messages.pop() ?? "";
          for (const raw of messages) {
            const parsed = parseSSEMessage(raw);
            if (!parsed) continue;
            if (parsed.kind === "event") {
              applyEvent(parsed.payload);
            } else {
              applyError(parsed.payload);
              // The server promises to close after the terminal error, but
              // we abort defensively to avoid lingering reads.
              controller.abort();
              return;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        applyError({
          code: "HAIKU_CALL_FAILED",
          message: (err as Error).message ?? "Network error",
        });
      } finally {
        // Streaming flag is cleared inside READY / error paths; this is the
        // belt-and-suspenders fallback for unexpected stream termination.
        setIsStreaming(false);
      }
    },
    [applyEvent, applyError],
  );

  // ── File intake ──────────────────────────────────────────────────────────

  const validateAndUpload = useCallback(
    (file: File) => {
      if (file.type !== ACCEPT_MIME) {
        setValidationError("Please upload a PDF file.");
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setValidationError("File is larger than 8 MB.");
        return;
      }
      setValidationError(null);
      setFileName(file.name);
      setFileSize(file.size);
      setHasFile(true);
      const data = new FormData();
      data.append("resume", file);
      void startStream(data);
    },
    [startStream],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    // Reset the input so the same file can be re-selected after a remove.
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDropzoneKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    // Roll back to the prior state — empty if this was a first upload,
    // legacy/snapshot if the user replaced an existing resume.
    if (initialHasFile && initialExtracted) {
      setPipeline(pipelineFromSnapshot(initialExtracted));
      setFileName(initial?.resumeFileName ?? "");
      setFileSize(null);
      setHasFile(true);
    } else if (initialHasFile) {
      setPipeline(LEGACY_PIPELINE);
      setFileName(initial?.resumeFileName ?? "");
      setFileSize(null);
      setHasFile(true);
    } else {
      setPipeline(EMPTY_PIPELINE);
      setFileName("");
      setFileSize(null);
      setHasFile(false);
    }
  };

  const handleRemove = async () => {
    abortRef.current?.abort();
    try {
      await fetch("/api/profile/resume", { method: "DELETE" });
    } catch {
      // Non-blocking — UI state still resets even if the network hiccups.
    }
    setHasFile(false);
    setFileName("");
    setFileSize(null);
    setLastTouched(null);
    setPipeline(EMPTY_PIPELINE);
    setError(null);
    setValidationError(null);
    router.refresh();
  };

  const handleReplace = () => fileInputRef.current?.click();

  const handleReextract = () => {
    // The route promises ?reextract=true with an empty body re-runs parse
    // against the existing on-disk file. We hit the same SSE endpoint so
    // the strip lights up the same way.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      try {
        setError(null);
        setIsStreaming(true);
        setPipeline({
          ...LEGACY_PIPELINE,
          pills: {
            UPLOADED: "done",
            PARSED: "active",
            INDEXED: "pending",
            MATCHED: "pending",
            READY: "pending",
          },
        });
        const res = await fetch("/api/profile/resume?reextract=true", {
          method: "POST",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          applyError({
            code: "HAIKU_CALL_FAILED",
            message: `Re-extract failed (${res.status})`,
          });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const messages = buf.split("\n\n");
          buf = messages.pop() ?? "";
          for (const raw of messages) {
            const parsed = parseSSEMessage(raw);
            if (!parsed) continue;
            if (parsed.kind === "event") {
              applyEvent(parsed.payload);
            } else {
              applyError(parsed.payload);
              controller.abort();
              return;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        applyError({
          code: "HAIKU_CALL_FAILED",
          message: (err as Error).message ?? "Re-extract failed",
        });
      } finally {
        setIsStreaming(false);
      }
    })();
  };

  // ── Derived view state ───────────────────────────────────────────────────

  const allDone = useMemo(
    () => STAGE_ORDER.every((s) => pipeline.pills[s] === "done"),
    [pipeline.pills],
  );
  const showLegacyReextract =
    hasFile && !isStreaming && !error && !pipeline.extracted;
  const liveCaption = isStreaming
    ? "live · being indexed"
    : allDone && lastTouched
      ? `last touched ${formatRelative(lastTouched)}`
      : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className={directionASectionClass}>
        <SectionHeader
          eyebrow={
            <FormEyebrow accent={!hasFile}>
              {hasFile
                ? "stage · resume · in your system"
                : "stage · resume · waiting for upload"}
            </FormEyebrow>
          }
          title={hasFile ? "One file, indexed." : "Drop your resume in"}
          subtitle={
            hasFile
              ? "We use this snapshot to autofill applications and to power the match counter."
              : "We'll extract your years, role, education, and top skills."
          }
        />

        {hasFile ? (
          <IndexedArtifactCard
            fileName={fileName}
            fileSize={fileSize}
            pipeline={pipeline}
            liveCaption={liveCaption}
            matchCount={pipeline.matchCount}
            isStreaming={isStreaming}
            errored={Boolean(error)}
            reducedMotion={Boolean(reducedMotion)}
            onCancel={handleCancel}
          />
        ) : (
          <Dropzone
            isDragging={isDragging}
            isStreaming={isStreaming}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleDropzoneKey}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        )}

        {(validationError || error) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.06)] px-3.5 py-2.5"
          >
            <AlertCircle className="w-4 h-4 mt-[1px] text-[var(--color-error)] shrink-0" />
            <div className="min-w-0 text-[13px] text-[var(--color-error-light)]">
              {validationError ?? (
                <>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-error)]">
                    {error?.code.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <p className="mt-1 leading-relaxed">
                    {error ? ERROR_RECOVERY[error.code] : null}
                  </p>
                  {error?.message && (
                    <p className="mt-1 text-text-dim text-[12px] font-mono">
                      {truncate(error.message, 140)}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_MIME}
          className="hidden"
          onChange={handleFileChange}
          aria-label="Upload resume PDF"
        />

        {hasFile && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              {showLegacyReextract && (
                <FormEyebrow>
                  parse pending · click re-extract to index this file
                </FormEyebrow>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showLegacyReextract && (
                <button
                  type="button"
                  onClick={handleReextract}
                  className={ghostBtnClass}
                >
                  Re-extract
                </button>
              )}
              <button
                type="button"
                onClick={handleReplace}
                disabled={isStreaming}
                className={ghostBtnClass}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isStreaming}
                className={`${ghostBtnClass} hover:text-[var(--color-error)]`}
                aria-label="Remove resume"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </section>

      {pipeline.extracted && (
        <ExtractedStats
          extracted={pipeline.extracted}
          backfilled={pipeline.backfilled}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface DropzoneProps {
  isDragging: boolean;
  isStreaming: boolean;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
}

function Dropzone({
  isDragging,
  isStreaming,
  onClick,
  onKeyDown,
  onDrop,
  onDragOver,
  onDragLeave,
}: DropzoneProps) {
  const baseClass =
    "w-full rounded-[14px] border border-dashed py-12 px-6 " +
    "flex flex-col items-center justify-center gap-3 " +
    "transition-colors cursor-pointer outline-none " +
    "focus-visible:border-[rgba(196,181,253,0.50)] " +
    "focus-visible:shadow-[0_0_0_4px_rgba(196,181,253,0.10)]";
  const stateClass = isDragging
    ? "border-[rgba(196,181,253,0.55)] bg-[rgba(196,181,253,0.08)]"
    : "border-[rgba(196,181,253,0.30)] bg-[rgba(196,181,253,0.04)] " +
      "hover:border-[rgba(196,181,253,0.45)] hover:bg-[rgba(196,181,253,0.07)]";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={isStreaming}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`${baseClass} ${stateClass}`}
    >
      <Upload className="w-7 h-7 text-[var(--color-accent-lavender)]" />
      <div className="font-display text-[15px] font-medium text-text">
        Click or drop a PDF here
      </div>
      <div className="font-mono text-[11px] text-text-dim tabular-nums">
        max 8 MB · PDF only
      </div>
    </div>
  );
}

interface IndexedArtifactCardProps {
  fileName: string;
  fileSize: number | null;
  pipeline: PipelineState;
  liveCaption: string | null;
  matchCount: number | null;
  isStreaming: boolean;
  errored: boolean;
  reducedMotion: boolean;
  onCancel: () => void;
}

function IndexedArtifactCard({
  fileName,
  fileSize,
  pipeline,
  liveCaption,
  matchCount,
  isStreaming,
  errored,
  reducedMotion,
  onCancel,
}: IndexedArtifactCardProps) {
  const borderClass = errored
    ? "border-[rgba(251,113,133,0.32)]"
    : "border-[rgba(99,102,241,0.22)]";
  const haloClass =
    "bg-[radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.10)_0%,transparent_55%),radial-gradient(circle_at_0%_100%,rgba(34,211,238,0.06)_0%,transparent_55%)]";
  return (
    <div
      className={`relative overflow-hidden rounded-[14px] border ${borderClass} bg-bg-elev p-5 ${haloClass}`}
    >
      <div className="flex items-start gap-4">
        <FileTile />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isStreaming && !errored ? (
              <>
                <PulseDot />
                <FormEyebrow accent>
                  <span className="text-[var(--color-accent-cyan)]">
                    live · being indexed
                  </span>
                </FormEyebrow>
              </>
            ) : errored ? (
              <FormEyebrow>
                <span className="text-[var(--color-error)]">parse failed</span>
              </FormEyebrow>
            ) : (
              <FormEyebrow accent>indexed</FormEyebrow>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <h3 className="font-mono text-[14.5px] text-text truncate">
              {fileName || "resume.pdf"}
            </h3>
            {isStreaming && (
              <button
                type="button"
                onClick={onCancel}
                aria-label="Cancel upload"
                className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-[8px] bg-white/[0.04] border border-white/10 text-text-muted hover:text-text hover:border-white/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            className="font-mono text-[11px] text-text-dim mt-1 tabular-nums"
            aria-live="polite"
          >
            {fileSize != null && <span>{formatBytes(fileSize)}</span>}
            {fileSize != null && liveCaption && <span> · </span>}
            {liveCaption}
            {matchCount != null && (
              <>
                {" · "}
                <span className="text-[var(--color-accent-lavender)]">
                  {matchCount} matches
                </span>
              </>
            )}
          </div>

          <ParseStrip pills={pipeline.pills} reducedMotion={reducedMotion} />
        </div>
      </div>
    </div>
  );
}

function FileTile() {
  return (
    <div
      aria-hidden
      className="shrink-0 w-[64px] h-[82px] rounded-[10px] flex flex-col items-center justify-center gap-1 border border-white/50 text-[var(--color-bg)]"
      style={{
        background: "linear-gradient(180deg, var(--color-text) 0%, var(--color-accent-lavender) 130%)",
        boxShadow:
          "0 16px 40px -16px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      <FileText className="w-6 h-6" />
      <span className="font-mono text-[9px] font-semibold tracking-[0.10em]">
        PDF
      </span>
    </div>
  );
}

interface ParseStripProps {
  pills: Readonly<Record<StageName, PillState>>;
  reducedMotion: boolean;
}

// Each stage's signature color (matches the prototype). Lavender is shared
// with the manifold motif; cyan caps the strip on READY.
const STAGE_COLOR: Readonly<Record<StageName, string>> = {
  UPLOADED: "#6366f1",
  PARSED: "#8b5cf6",
  INDEXED: "#a855f7",
  MATCHED: "#d946ef",
  READY: "#22d3ee",
};

function ParseStrip({ pills, reducedMotion }: ParseStripProps) {
  return (
    <div className="mt-4 grid grid-cols-5 gap-1.5">
      {STAGE_ORDER.map((stage) => {
        const state = pills[stage];
        const color = STAGE_COLOR[stage];
        const bar =
          state === "done"
            ? { background: color, boxShadow: `0 0 6px ${color}80` }
            : state === "active"
              ? {
                  background: color,
                  boxShadow: `0 0 8px ${color}`,
                  animation: reducedMotion
                    ? undefined
                    : "pp-pulse-glow 1.4s ease-in-out infinite",
                }
              : state === "error"
                ? { background: "#fb7185", boxShadow: "0 0 6px #fb7185" }
                : { background: `${color}22` };
        const labelColor =
          state === "error"
            ? "#fb7185"
            : state === "done" || state === "active"
              ? color
              : "var(--color-text-dim)";
        return (
          <div key={stage} className="text-center min-w-0">
            <div
              className="h-[5px] rounded-full"
              style={bar}
              aria-hidden
            />
            <div
              className="font-mono mt-1.5 text-[9px] tracking-[0.06em] uppercase truncate"
              style={{ color: labelColor }}
            >
              {stage}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ExtractedStatsProps {
  extracted: ExtractedResumeData;
  backfilled: ReadonlyArray<string>;
}

function ExtractedStats({ extracted, backfilled }: ExtractedStatsProps) {
  const lastRole = useMemo(() => {
    const parts = [extracted.currentTitle, extracted.mostRecentCompany].filter(
      (v): v is string => !!v,
    );
    return parts.length ? truncate(parts.join(" · "), 40) : "—";
  }, [extracted.currentTitle, extracted.mostRecentCompany]);

  const education = useMemo(() => {
    if (!extracted.educationTop) return "—";
    const parts = [
      extracted.educationTop.degree,
      extracted.educationTop.school,
    ].filter((v): v is string => !!v);
    return parts.length ? truncate(parts.join(" · "), 40) : "—";
  }, [extracted.educationTop]);

  const topSkills = useMemo(() => {
    if (!extracted.skills.length) return "—";
    return extracted.skills.slice(0, 3).join(" · ");
  }, [extracted.skills]);

  const backfilledLabels = backfilled
    .map((col) => BACKFILL_LABELS[col] ?? col)
    .filter(Boolean);

  return (
    <section className={directionASectionClass}>
      <SectionHeader
        eyebrow={<FormEyebrow>extracted from your file</FormEyebrow>}
        title="What we pulled out"
        subtitle="Used to autofill applications and to power the match counter — not visible to recruiters."
      />

      {backfilledLabels.length > 0 && (
        <div className="rounded-[10px] border border-[rgba(196,181,253,0.20)] bg-[rgba(196,181,253,0.04)] px-3 py-2">
          <FormEyebrow accent>
            auto-filled from your file: {backfilledLabels.join(", ")}
          </FormEyebrow>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="YEARS"
          value={
            extracted.yearsExperience != null
              ? String(extracted.yearsExperience)
              : "—"
          }
          display
        />
        <StatTile label="LAST ROLE" value={lastRole} />
        <StatTile label="EDUCATION" value={education} />
        <StatTile label="TOP SKILLS" value={topSkills} />
      </div>
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  // If true, render the value in the display font (used for the YEARS
  // numeric so it pops). Default renders as mono for textual stats.
  display?: boolean;
}

function StatTile({ label, value, display = false }: StatTileProps) {
  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 min-w-0">
      <FormEyebrow>{label}</FormEyebrow>
      <div
        className={
          display
            ? "font-display text-[20px] font-medium text-text tabular-nums mt-1"
            : "font-mono text-[12.5px] text-text mt-1 truncate"
        }
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
