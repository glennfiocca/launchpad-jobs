import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSpacesClient, SPACES_BUCKET } from "@/lib/spaces";
import {
  extractPdfText,
  extractStructuredFromText,
  ResumeParseError,
} from "@/lib/profile/resume-parser";
import { backfillProfileFromExtracted } from "@/lib/profile/resume-write-if-empty";
import type {
  ExtractedResumeData,
  ResumeUploadEvent,
  ResumeUploadError,
  ResumeUploadErrorCode,
} from "@/lib/profile/resume-types";

// 8 MB cap on uploaded PDFs — keeps pdf-parse latency bounded and matches the
// limit advertised in the upload UI. Re-export is `const` so the route can
// short-circuit oversize uploads before draining the multipart body.
const MAX_SIZE = 8 * 1024 * 1024;

// Cap on the number of skill tokens fed into the tsquery — beyond ~8 the
// signal is dominated by stop-word-like generic skills and the query plan
// degrades. Kept here (not in resume-parser) because it's a route-level
// match-count concern, not a parsing concern.
const MAX_TSQUERY_SKILLS = 8;

function getSpacesKey(userId: string, fileName: string): string {
  return `resumes/${userId}/${Date.now()}-${fileName}`;
}

// ─── SSE encoding ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

/**
 * Encode a single Server-Sent Event. The double newline at the end is part
 * of the SSE spec — without it the client buffers the event indefinitely.
 */
function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseStage(data: ResumeUploadEvent): Uint8Array {
  return sse("stage", data);
}

function sseError(data: ResumeUploadError): Uint8Array {
  return sse("error", data);
}

/**
 * Lift an unknown thrown value into a typed `ResumeUploadError`. `ResumeParseError`
 * already carries the right discriminant; everything else is mapped to the
 * supplied default `code`. We never expose `err.cause` to the client — only
 * the human-friendly message — but we still log the full error server-side
 * so production triage works.
 */
function toUploadError(
  err: unknown,
  defaultCode: ResumeUploadErrorCode,
): ResumeUploadError {
  if (err instanceof ResumeParseError) {
    return { code: err.code, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: defaultCode, message };
}

// ─── Upload + persistence helpers ─────────────────────────────────────────────

interface UploadedResume {
  fileName: string;
  size: number;
  buffer: Buffer;
}

/**
 * Persist the uploaded PDF to either DO Spaces (prod) or the DB bytes
 * column (local dev fallback). Mirrors the prior route's dual-storage path
 * exactly — the only diff is that the SSE route calls this from inside
 * the stream so failures surface as `UPLOAD_FAILED`-equivalent errors.
 * Returns the userProfile id so downstream steps can update the row.
 */
async function persistUpload(
  userId: string,
  userEmail: string,
  upload: UploadedResume,
): Promise<{ profileId: string }> {
  const spaces = getSpacesClient();

  if (spaces) {
    const key = getSpacesKey(userId, upload.fileName);
    await spaces.send(
      new PutObjectCommand({
        Bucket: SPACES_BUCKET,
        Key: key,
        Body: upload.buffer,
        ContentType: "application/pdf",
        ACL: "private",
      }),
    );
    const resumeUrl = `https://${SPACES_BUCKET}.${process.env.DO_SPACES_REGION ?? "nyc3"}.digitaloceanspaces.com/${key}`;

    const profile = await db.userProfile.upsert({
      where: { userId },
      update: {
        resumeUrl,
        resumeFileName: upload.fileName,
        resumeMimeType: "application/pdf",
        resumeData: null,
      },
      create: {
        userId,
        firstName: "",
        lastName: "",
        email: userEmail,
        resumeUrl,
        resumeFileName: upload.fileName,
        resumeMimeType: "application/pdf",
      },
      select: { id: true },
    });
    return { profileId: profile.id };
  }

  const profile = await db.userProfile.upsert({
    where: { userId },
    update: {
      resumeData: upload.buffer,
      resumeFileName: upload.fileName,
      resumeMimeType: "application/pdf",
      resumeUrl: null,
    },
    create: {
      userId,
      firstName: "",
      lastName: "",
      email: userEmail,
      resumeData: upload.buffer,
      resumeFileName: upload.fileName,
      resumeMimeType: "application/pdf",
    },
    select: { id: true },
  });
  return { profileId: profile.id };
}

/**
 * Re-extract path: fetch the previously-stored PDF bytes from whichever
 * backend currently holds them. Returns `null` if the user has no resume
 * on file (the route turns this into a 400 before opening the stream).
 */
async function loadExistingResume(
  userId: string,
): Promise<
  | { profileId: string; fileName: string; size: number; buffer: Buffer }
  | null
> {
  const profile = await db.userProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      resumeData: true,
      resumeUrl: true,
      resumeFileName: true,
    },
  });
  if (!profile) return null;

  const fileName = profile.resumeFileName ?? "resume.pdf";

  // Spaces-stored case: pull the object body back as a buffer.
  if (profile.resumeUrl?.startsWith("https://")) {
    const spaces = getSpacesClient();
    if (!spaces) return null;
    const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
    if (!key) return null;

    const obj = await spaces.send(
      new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }),
    );
    if (!obj.Body) return null;
    // `transformToByteArray` is on the SDK's StreamingBody. Cast keeps us
    // strict-TS clean without depending on internal types.
    const body = obj.Body as { transformToByteArray: () => Promise<Uint8Array> };
    const bytes = await body.transformToByteArray();
    const buffer = Buffer.from(bytes);
    return {
      profileId: profile.id,
      fileName,
      size: buffer.byteLength,
      buffer,
    };
  }

  if (profile.resumeData) {
    const buffer = Buffer.from(profile.resumeData);
    return {
      profileId: profile.id,
      fileName,
      size: buffer.byteLength,
      buffer,
    };
  }

  return null;
}

// ─── INDEXED stage helpers ────────────────────────────────────────────────────

/**
 * Persist the validated extraction snapshot to `UserProfile.resumeExtracted`
 * (JSONB) plus the `resumeExtractedAt` timestamp the UI uses for "last
 * parsed" copy. Kept separate from the backfill helper because the JSONB
 * snapshot is wholesale-replaced on each upload while the scalar backfill
 * is write-if-empty.
 */
async function writeExtractedSnapshot(
  profileId: string,
  extracted: ExtractedResumeData,
): Promise<void> {
  await db.userProfile.update({
    where: { id: profileId },
    data: {
      // Cast through `unknown` to Prisma's structural JSON-input type. The
      // zod-validated `ExtractedResumeData` is a strict superset of valid
      // JSON, so this is a type-only narrowing — no runtime coercion.
      resumeExtracted: extracted as unknown as Prisma.InputJsonValue,
      resumeExtractedAt: new Date(),
    },
  });
}

// ─── MATCHED stage ────────────────────────────────────────────────────────────

/**
 * Build a Postgres tsquery `|`-joined OR expression from the candidate's
 * top skills. Strips non-word/space chars per token so a stray punctuation
 * mark (e.g. "C++") doesn't blow up `to_tsquery`. Returns `null` when no
 * usable tokens remain — the caller short-circuits to a 0 match count.
 */
function buildTsQuery(skills: string[]): string | null {
  const tokens = skills
    .slice(0, MAX_TSQUERY_SKILLS)
    .map((s) => s.replace(/[^\w\s]/g, "").trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) return null;
  return tokens.join(" | ");
}

/**
 * Simple match-count query. PR3 (Agent C) owns the full scoring rewrite —
 * this is deliberately a single COUNT(*) so PR2 ships without depending
 * on PR3. Language-gated jobs are excluded entirely here (no SpokenLanguage
 * lookup yet) so the count is conservative.
 */
async function countMatchingJobs(
  extracted: ExtractedResumeData,
): Promise<number> {
  const tsq = buildTsQuery(extracted.skills);
  if (!tsq) return 0;

  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "Job"
    WHERE "isActive" = true
      AND ("requiredLanguages" IS NULL OR cardinality("requiredLanguages") = 0)
      AND "searchVector" @@ to_tsquery('english', ${tsq})
  `;
  // Match counts are bounded by total active job rows (well under 2^53).
  // Safe to narrow bigint → number. Use BigInt(0) rather than the `0n`
  // literal since tsconfig still targets pre-ES2020.
  return Number(rows[0]?.count ?? BigInt(0));
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email ?? "";

  const url = new URL(request.url);
  const reextract = url.searchParams.get("reextract") === "true";

  // ── Validate the request BEFORE opening the SSE stream so the client's
  // `res.ok` check catches 4xx synchronously instead of having to consume
  // the stream to learn about a bad request.
  let prepared:
    | {
        mode: "upload";
        upload: UploadedResume;
      }
    | {
        mode: "reextract";
        existing: NonNullable<Awaited<ReturnType<typeof loadExistingResume>>>;
      };

  if (reextract) {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("resume");
    // Spec: re-extract only when no file is present in the form. If a file
    // came in, treat it as a normal upload — drops through to the else.
    if (file instanceof File && file.size > 0) {
      const validation = validateUploadedFile(file);
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: validation.status },
        );
      }
      prepared = { mode: "upload", upload: await fileToUpload(file) };
    } else {
      const existing = await loadExistingResume(userId);
      if (!existing) {
        return NextResponse.json(
          { error: "No resume on file to re-extract" },
          { status: 400 },
        );
      }
      prepared = { mode: "reextract", existing };
    }
  } else {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "Invalid multipart body" },
        { status: 400 },
      );
    }
    const file = formData.get("resume");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }
    const validation = validateUploadedFile(file);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status },
      );
    }
    prepared = { mode: "upload", upload: await fileToUpload(file) };
  }

  // ── Validation passed. Open the SSE stream and drive the pipeline.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      // Single-call close guard — `controller.close()` after a previous
      // close throws, which would surface as an unhandled rejection in
      // the Next runtime. The flag keeps the `finally` block idempotent.
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Stream may already be aborted by the client disconnecting.
        }
      };

      try {
        // ── Stage 1: UPLOADED (or skip on re-extract)
        let profileId: string;
        let buffer: Buffer;
        let fileName: string;
        let size: number;

        if (prepared.mode === "upload") {
          const persisted = await persistUpload(
            userId,
            userEmail,
            prepared.upload,
          );
          profileId = persisted.profileId;
          buffer = prepared.upload.buffer;
          fileName = prepared.upload.fileName;
          size = prepared.upload.size;

          controller.enqueue(
            sseStage({ stage: "UPLOADED", fileName, size }),
          );
        } else {
          profileId = prepared.existing.profileId;
          buffer = prepared.existing.buffer;
          fileName = prepared.existing.fileName;
          size = prepared.existing.size;
          // Spec: skip UPLOADED on re-extract — the file already exists.
        }

        // ── Stage 2: PARSED (pdf-parse)
        let rawText: string;
        try {
          rawText = await extractPdfText(buffer);
        } catch (err) {
          controller.enqueue(sseError(toUploadError(err, "PDF_EXTRACTION_FAILED")));
          return;
        }
        controller.enqueue(
          sseStage({ stage: "PARSED", textLength: rawText.length }),
        );

        // ── Stage 3: INDEXED (Haiku + write snapshot + backfill)
        let extracted: ExtractedResumeData;
        try {
          extracted = await extractStructuredFromText(rawText);
        } catch (err) {
          controller.enqueue(sseError(toUploadError(err, "HAIKU_CALL_FAILED")));
          return;
        }

        try {
          await writeExtractedSnapshot(profileId, extracted);
        } catch (err) {
          // Treat snapshot-write failure as an invalid-output style error —
          // the data round-tripped from Haiku but we couldn't persist it.
          controller.enqueue(
            sseError(toUploadError(err, "HAIKU_INVALID_OUTPUT")),
          );
          return;
        }

        let backfilled: string[] = [];
        try {
          const result = await backfillProfileFromExtracted(profileId, extracted);
          backfilled = result.written;
        } catch (err) {
          // Backfill is opportunistic. Log + emit INDEXED with empty
          // backfilled list rather than failing the whole stream — the
          // user still has a valid snapshot and a stored file.
          console.error("[resume/route] backfill failed:", err);
        }

        controller.enqueue(
          sseStage({ stage: "INDEXED", extracted, backfilled }),
        );

        // ── Stage 4: MATCHED
        let matchCount = 0;
        try {
          matchCount = await countMatchingJobs(extracted);
        } catch (err) {
          // Per the PR2 contract — match-count failure is non-fatal: emit
          // an error event and close the stream. The UI hides the badge
          // but keeps the indexed-success state.
          console.error("[resume/route] match query failed:", err);
          controller.enqueue(sseError(toUploadError(err, "MATCH_QUERY_FAILED")));
          return;
        }
        controller.enqueue(sseStage({ stage: "MATCHED", matchCount }));

        // ── Stage 5: READY
        controller.enqueue(sseStage({ stage: "READY" }));
      } catch (err) {
        // Top-level safety net — anything escaping the stage-level catches
        // (e.g. persistUpload throwing, Prisma connection drop) becomes a
        // generic HAIKU_CALL_FAILED so the client at least sees a typed
        // error code rather than a torn stream. We never re-throw from
        // here because that would close the stream with a 500 mid-flight.
        console.error("[resume/route] unhandled stream error:", err);
        try {
          controller.enqueue(sseError(toUploadError(err, "HAIKU_CALL_FAILED")));
        } catch {
          // Stream already closed by client — nothing to do.
        }
      } finally {
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx response buffering — without this, events get
      // batched until the stream closes and the UI sees nothing in
      // between, defeating the whole point of SSE.
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Validation helpers (pre-stream) ──────────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function validateUploadedFile(file: File): ValidationResult {
  if (file.type !== "application/pdf") {
    return { ok: false, error: "Only PDF files are accepted", status: 400 };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "File too large. Max 8MB.", status: 400 };
  }
  return { ok: true };
}

async function fileToUpload(file: File): Promise<UploadedResume> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return { fileName: file.name, size: file.size, buffer };
}

// ─── GET handler (unchanged) ──────────────────────────────────────────────────

export async function GET(request: Request) {
  // `request` is intentionally unused — kept for Next.js route handler
  // signature consistency. void-cast silences `no-unused-vars` cleanly.
  void request;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      resumeData: true,
      resumeFileName: true,
      resumeMimeType: true,
      resumeUrl: true,
    },
  });

  if (!profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Serve from DO Spaces via presigned URL (private bucket)
  if (profile.resumeUrl?.startsWith("https://")) {
    const spaces = getSpacesClient();
    if (spaces) {
      const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
      if (!key) {
        return new NextResponse("Resume URL is invalid", { status: 404 });
      }
      try {
        const signedUrl = await getSignedUrl(
          spaces,
          new GetObjectCommand({
            Bucket: SPACES_BUCKET,
            Key: key,
            ResponseContentDisposition: `inline; filename="${profile.resumeFileName ?? "resume.pdf"}"`,
            ResponseContentType: profile.resumeMimeType ?? "application/pdf",
          }),
          { expiresIn: 900 },
        );
        return NextResponse.redirect(signedUrl);
      } catch {
        return new NextResponse("Failed to generate resume link", {
          status: 502,
        });
      }
    }
  }

  if (!profile.resumeData) {
    return new NextResponse("No resume uploaded", { status: 404 });
  }

  return new NextResponse(new Uint8Array(profile.resumeData), {
    headers: {
      "Content-Type": profile.resumeMimeType ?? "application/pdf",
      "Content-Disposition": `inline; filename="${profile.resumeFileName ?? "resume.pdf"}"`,
    },
  });
}

// ─── DELETE handler (clears extracted snapshot too) ───────────────────────────

export async function DELETE(request: Request) {
  void request;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch profile first to retrieve resumeUrl for Spaces cleanup
  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeUrl: true },
  });

  await db.userProfile.updateMany({
    where: { userId: session.user.id },
    data: {
      resumeData: null,
      resumeFileName: null,
      resumeMimeType: null,
      resumeUrl: null,
      // Also clear the structured snapshot + timestamp so the profile
      // doesn't keep showing stale "auto-filled from resume" badges
      // after the source file has been removed. `Prisma.JsonNull` is
      // the canonical way to write a SQL NULL into a Json column.
      resumeExtracted: Prisma.JsonNull,
      resumeExtractedAt: null,
    },
  });

  // Delete from DO Spaces if applicable (non-fatal)
  const spaces = getSpacesClient();
  if (spaces && profile?.resumeUrl) {
    const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
    if (key) {
      await spaces
        .send(
          new DeleteObjectCommand({
            Bucket: SPACES_BUCKET,
            Key: key,
          }),
        )
        .catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
