import type { PendingQuestion, QuestionMeta } from "@/types";

/**
 * Pure (no-IO) data shaping for the operator-queue Q&A summary PDF.
 *
 * The Application snapshot is a loose `Json` blob — this module narrows it
 * into the typed sections the renderer expects, with strict null/empty
 * handling so older snapshots (missing optional fields) still produce a
 * readable PDF.
 */

export const OPERATOR_SUMMARY_KIND = "OPERATOR_SUMMARY" as const;

export interface ApplicationSummaryHeader {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  applyUrl: string | null;
  generatedAt: Date;
}

export interface ApplicantBlock {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  preferredFirstName: string | null;
  country: string | null;
  linkedIn: string | null;
  github: string | null;
  website: string | null;
  resumeFileName: string | null;
}

export interface TrackingBlock {
  trackingEmail: string | null;
  boardToken: string;
  externalId: string;
  manualApplyUrl: string | null;
  snapshotAt: string | null;
}

export interface QAEntry {
  label: string;
  answer: string;
  required: boolean;
  status: "answered" | "unanswered";
}

export interface EeocBlock {
  gender: string | null;
  race: string | null;
  veteranStatus: string | null;
  disability: string | null;
}

export interface ApplicationSummaryData {
  header: ApplicationSummaryHeader;
  applicant: ApplicantBlock;
  tracking: TrackingBlock;
  answered: QAEntry[];
  pending: QAEntry[];
  eeoc: EeocBlock | null;
  operatorNotes: string[];
}

interface BuildInput {
  applicationId: string;
  jobTitle: string;
  companyName: string;
  applyUrl: string | null;
  // Loose snapshot — comes straight from `Application.applicationSnapshot` (Json).
  snapshot: Record<string, unknown>;
  now?: Date; // injectable for tests
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Render a select-style answer (e.g. ["123","456"]) using its label map when available. */
function resolveSelectAnswer(
  rawAnswer: string,
  selectValues: Array<{ value: string | number; label: string }> | undefined
): string {
  if (!selectValues || selectValues.length === 0) return rawAnswer;
  // Greenhouse multi-select answers can be JSON arrays of IDs; try to parse.
  let ids: Array<string | number> = [rawAnswer];
  if (rawAnswer.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawAnswer);
      if (Array.isArray(parsed)) ids = parsed as Array<string | number>;
    } catch {
      /* fall through to single-value lookup */
    }
  }
  const labels = ids.map((id) => {
    const match = selectValues.find((sv) => String(sv.value) === String(id));
    return match?.label ?? String(id);
  });
  return labels.join(", ");
}

/** Build the typed summary data from a raw application snapshot. */
export function buildApplicationSummaryData(input: BuildInput): ApplicationSummaryData {
  const { applicationId, jobTitle, companyName, applyUrl, snapshot, now = new Date() } = input;

  const firstName = asString(snapshot.firstName) ?? "";
  const lastName = asString(snapshot.lastName) ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || "(unknown applicant)";

  const coreExtras = asRecord(snapshot.coreFieldExtras);
  const eeocRaw = coreExtras ? asRecord(coreExtras.eeoc) : null;

  const applicant: ApplicantBlock = {
    fullName,
    email: asString(snapshot.email) ?? "(no email)",
    phone: asString(snapshot.phone),
    location: asString(snapshot.location),
    preferredFirstName: coreExtras ? asString(coreExtras.preferredFirstName) : null,
    country: coreExtras ? asString(coreExtras.country) : null,
    linkedIn: coreExtras ? asString(coreExtras.linkedIn) : null,
    github: coreExtras ? asString(coreExtras.github) : null,
    website: coreExtras ? asString(coreExtras.website) : null,
    resumeFileName: asString(snapshot.resumeFileName),
  };

  const tracking: TrackingBlock = {
    trackingEmail: asString(snapshot.trackingEmail),
    boardToken: asString(snapshot.boardToken) ?? "(unknown)",
    externalId: asString(snapshot.externalId) ?? "(unknown)",
    manualApplyUrl: asString(snapshot.manualApplyUrl),
    snapshotAt: asString(snapshot.snapshotAt),
  };

  // Map answered questions: questionMeta entries paired with questionAnswers values.
  const questionAnswers = asRecord(snapshot.questionAnswers) ?? {};
  const questionMeta = asArray<QuestionMeta>(snapshot.questionMeta);
  const answered: QAEntry[] = [];
  for (const meta of questionMeta) {
    const raw = asString(questionAnswers[meta.fieldName]);
    if (raw === null) continue;
    const display = meta.selectValues ? resolveSelectAnswer(raw, meta.selectValues) : raw;
    answered.push({
      label: meta.label || meta.fieldName,
      answer: display,
      required: false, // questionMeta does not carry required-ness
      status: "answered",
    });
  }

  // Pending questions: include both already-answered (userAnswer present)
  // and unanswered. We separate them in the layout.
  const pendingRaw = asArray<PendingQuestion>(snapshot.pendingQuestions);
  const pending: QAEntry[] = pendingRaw.map((q) => {
    const userAnswer = asString(q.userAnswer);
    return {
      label: q.label || q.fieldName,
      answer:
        userAnswer === null
          ? "(needs operator input)"
          : q.selectValues
            ? resolveSelectAnswer(userAnswer, q.selectValues)
            : userAnswer,
      required: q.required ?? false,
      status: userAnswer === null ? "unanswered" : "answered",
    };
  });

  const eeoc: EeocBlock | null = eeocRaw
    ? {
        gender: asString(eeocRaw.gender),
        race: asString(eeocRaw.race),
        veteranStatus: asString(eeocRaw.veteranStatus),
        disability: asString(eeocRaw.disability),
      }
    : null;

  // Operator-facing hints — purely derived, safe to surface even on older snapshots.
  const operatorNotes: string[] = [];
  const requiredOpen = pending.filter((q) => q.required && q.status === "unanswered").length;
  if (requiredOpen > 0) {
    operatorNotes.push(
      `${requiredOpen} required field${requiredOpen === 1 ? "" : "s"} still need a manual answer.`
    );
  }
  if (!applicant.resumeFileName) {
    operatorNotes.push("No resume file recorded — applicant may need to be contacted.");
  }
  if (eeoc && Object.values(eeoc).every((v) => v === null)) {
    operatorNotes.push(
      "EEOC fields are blank in the snapshot — extension may attempt 'decline to answer' fallback."
    );
  }
  if (!tracking.trackingEmail) {
    operatorNotes.push("No tracking email assigned — outbound replies will not be linked to this case.");
  }

  return {
    header: {
      applicationId,
      jobTitle,
      companyName,
      applyUrl,
      generatedAt: now,
    },
    applicant,
    tracking,
    answered,
    pending,
    eeoc,
    operatorNotes,
  };
}

/** Stable, sortable filename. Safe for filesystem and HTTP headers. */
export function buildSummaryFileName(applicationId: string, generatedAt: Date): string {
  const ts = generatedAt.toISOString().replace(/[:.]/g, "-");
  return `application-${applicationId}-summary-${ts}.pdf`;
}

/** Stable storage key — one canonical key per (application, kind). Idempotent overwrite. */
export function buildSummarySpacesKey(applicationId: string): string {
  return `application-documents/${applicationId}/${OPERATOR_SUMMARY_KIND.toLowerCase()}.pdf`;
}
