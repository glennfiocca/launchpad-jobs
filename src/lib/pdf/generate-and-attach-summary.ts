import { db } from "@/lib/db";
import { uploadPrivateBuffer } from "@/lib/spaces";
import {
  buildApplicationSummaryData,
  buildSummaryFileName,
  buildSummarySpacesKey,
  OPERATOR_SUMMARY_KIND,
} from "./application-summary-data";
import { renderApplicationSummaryPDF } from "./application-summary-renderer";

/**
 * Loose JSON-like input — accepts the typed `ApplicationSnapshot` from the
 * apply flow as well as Prisma `Json` values from the DB. Narrowed inside
 * `buildApplicationSummaryData` with explicit field-level type checks.
 */
type SnapshotLike = Record<string, unknown> | null | undefined;

interface AttachInput {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  applyUrl: string | null;
  snapshot: SnapshotLike;
  /** Operator/admin who triggered (regenerate). null for system-driven generation. */
  actorUserId?: string | null;
}

interface AttachResult {
  documentId: string;
  spacesKey: string;
  fileName: string;
  sizeBytes: number;
  regenerated: boolean;
}

/**
 * Generate the operator-queue Q&A summary PDF, store it privately in Spaces,
 * and upsert a single ApplicationDocument row per (applicationId, kind).
 *
 * Idempotency:
 *   - storage key is stable for (applicationId, kind) — overwriting a key
 *     overwrites the bytes in Spaces, so retries don't pile up objects.
 *   - DB row is upserted on the (applicationId, kind) unique index — at
 *     most one row per kind per application.
 *
 * Errors are NOT swallowed — caller decides whether to log-and-continue or
 * propagate. The queue-routing branch logs and continues so PDF failures
 * never block the operator workflow.
 */
export async function generateAndAttachOperatorSummary(input: AttachInput): Promise<AttachResult> {
  const data = buildApplicationSummaryData({
    applicationId: input.applicationId,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    applyUrl: input.applyUrl,
    snapshot: input.snapshot ?? {},
  });

  const buffer = await renderApplicationSummaryPDF({ data });
  const fileName = buildSummaryFileName(input.applicationId, data.header.generatedAt);
  const spacesKey = buildSummarySpacesKey(input.applicationId);

  await uploadPrivateBuffer(spacesKey, buffer, "application/pdf");

  // Atomic upsert + audit log in one transaction. We derive `regenerated`
  // from the row's own timestamps (createdAt !== updatedAt) so concurrent
  // background tasks racing to generate the PDF cannot both write a
  // PDF_GENERATED audit — at most one writes "first" and any subsequent
  // write produces PDF_REGENERATED. (Prisma's upsert is atomic against
  // the unique index; reading the row's createdAt/updatedAt within the
  // same transaction gives a consistent view.)
  const title = `Q&A summary — ${input.companyName} / ${input.jobTitle}`;
  const sizeBytes = buffer.byteLength;

  const document = await db.$transaction(async (tx) => {
    return tx.applicationDocument.upsert({
      where: { applicationId_kind: { applicationId: input.applicationId, kind: OPERATOR_SUMMARY_KIND } },
      create: {
        applicationId: input.applicationId,
        kind: OPERATOR_SUMMARY_KIND,
        fileName,
        mimeType: "application/pdf",
        spacesKey,
        sizeBytes,
        title,
      },
      update: {
        fileName,
        sizeBytes,
        title,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
  });

  // Treat sub-millisecond drift between createdAt/updatedAt as "first
  // generation" — Prisma sets both to the same Date for fresh rows.
  const regenerated = document.updatedAt.getTime() - document.createdAt.getTime() > 1;

  await db.applicationAuditLog.create({
    data: {
      applicationId: input.applicationId,
      actorUserId: input.actorUserId ?? null,
      action: regenerated ? "PDF_REGENERATED" : "PDF_GENERATED",
      metadata: {
        kind: OPERATOR_SUMMARY_KIND,
        fileName,
        spacesKey,
        sizeBytes,
      },
    },
  });

  return {
    documentId: document.id,
    spacesKey,
    fileName,
    sizeBytes,
    regenerated,
  };
}
