import { NextResponse } from "next/server";

import * as Sentry from "@sentry/nextjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getApplyStrategy } from "@/lib/ats/registry";
import { initializeAtsProviders } from "@/lib/ats/init";
import {
  autoAnswerQuestion,
  getUnansweredQuestions,
} from "@/lib/ats/question-matcher";
import { generateTrackingEmail } from "@/lib/utils";
import { sendApplyConfirmation } from "@/lib/apply-hooks";
import { createNotification } from "@/lib/notifications";
import { getPresignedGetUrl } from "@/lib/spaces";
import { generateAndAttachOperatorSummary } from "@/lib/pdf/generate-and-attach-summary";
import { checkAndConsumeCredit, FREE_TIER_CREDITS } from "@/lib/credits";
import { handleFirstApplicationConversion, isFirstApplication } from "@/lib/referral";
import { z } from "zod";
import type { ApiResponse, ApplicationWithJob, QuestionMeta, PendingQuestion } from "@/types";
import type { NormalizedQuestion, NormalizedFieldType } from "@/lib/ats/types";
import type { QuestionMatchProfile } from "@/lib/ats/question-matcher";
import type {
  AtsProvider,
  UserProfile,
  Skill,
  WorkExperience,
  EducationEntry,
  Project,
  Certification,
  SpokenLanguage,
} from "@prisma/client";

// Profile + Phase-4 child relations as loaded by the apply endpoint.
type ProfileWithRelations = UserProfile & {
  skills: Skill[];
  workExperiences: WorkExperience[];
  educationEntries: EducationEntry[];
  projects: Project[];
  certifications: Certification[];
  spokenLanguages: SpokenLanguage[];
};

// Error codes that route to the operator queue instead of hard-failing
const OPERATOR_QUEUE_CODES = new Set(
  (process.env.OPERATOR_QUEUE_CODES ?? "CAPTCHA_REQUIRED,BROWSER_LAUNCH_FAILED,NO_CONFIRMATION,FORM_NOT_FOUND").split(",")
);

// Phase-4 child-collection projections — trimmed shapes the extension /
// operator UIs can consume without round-tripping the full Prisma row.
interface SnapshotSkill {
  name: string;
  category: string;
  proficiency: number;
  yearsUsed?: number;
}
interface SnapshotWorkExperience {
  title: string;
  company: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  location?: string;
  employmentType: string;
  description?: string;
}
interface SnapshotEducationEntry {
  schoolName?: string;
  degree: string;
  fieldOfStudy: string;
  startYear?: number;
  endYear?: number;
  gpa?: number;
  honors?: string;
  activities?: string;
}
interface SnapshotProject {
  name: string;
  url?: string;
  repoUrl?: string;
  description?: string;
  technologies: string[];
  role?: string;
}
interface SnapshotCertification {
  name: string;
  issuer: string;
  issueDate?: string;
  expiryDate?: string;
  credentialUrl?: string;
  credentialId?: string;
}
interface SnapshotLanguage {
  name: string;
  proficiency: string;
}

interface ApplicationSnapshot {
  /** Discriminator so the extension picks the matcher table for new fields. */
  version?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  boardToken: string;
  externalId: string;
  manualApplyUrl?: string;
  resumeFileName?: string;
  resumeSpacesKey?: string;
  trackingEmail?: string;
  questionAnswers: Record<string, string>;
  questionMeta: QuestionMeta[];
  pendingQuestions: PendingQuestion[];
  snapshotAt: string;
  coreFieldExtras?: {
    preferredFirstName?: string;
    country?: string;
    linkedIn?: string;
    github?: string;
    website?: string;
    eeoc?: {
      gender?: string;
      race?: string;
      veteranStatus?: string;
      disability?: string;
    };
  };
  // ── Phase 4: extended profile data ───────────────────────────────────────
  // Extended social links
  twitterUrl?: string;
  stackOverflowUrl?: string;
  dribbbleUrl?: string;
  behanceUrl?: string;
  mediumUrl?: string;
  devToUrl?: string;
  googleScholarUrl?: string;
  huggingFaceUrl?: string;
  kaggleUrl?: string;
  youtubeUrl?: string;
  // Job-search preferences
  noticePeriodWeeks?: number;
  earliestStartDate?: string;
  targetRoles?: string[];
  targetIndustries?: string[];
  companySizePreferences?: string[];
  relocationOpen?: boolean;
  relocationCities?: string[];
  currencyPreference?: string;
  equityImportance?: string;
  desiredEmploymentTypes?: string[];
  searchStatus?: string;
  // Compliance
  hasDriversLicense?: boolean;
  willingBackgroundCheck?: boolean;
  willingDrugTest?: boolean;
  securityClearance?: string;
  eligibleCountries?: string[];
  // Application templates
  coverLetterIntro?: string;
  whyImLookingTemplate?: string;
  // Trimmed child collections
  skills?: SnapshotSkill[];
  workExperiences?: SnapshotWorkExperience[];
  educationEntries?: SnapshotEducationEntry[];
  projects?: SnapshotProject[];
  certifications?: SnapshotCertification[];
  languages?: SnapshotLanguage[];
}

/** Maximum serialized snapshot size before we drop the fattest fields. */
const MAX_SNAPSHOT_BYTES = 32 * 1024;

function dateISO(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Strip empty/null fields from a record so JSON stays compact. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * Trim a snapshot to fit under MAX_SNAPSHOT_BYTES.
 * Drops the fattest narrative fields first, then whole child arrays LIFO.
 * Logs the dropped fields with the application id (caller passes via id arg).
 */
function trimSnapshotToFit(
  snapshot: ApplicationSnapshot,
  applicationId: string
): ApplicationSnapshot {
  let serialized = JSON.stringify(snapshot);
  if (serialized.length <= MAX_SNAPSHOT_BYTES) return snapshot;

  const dropped: string[] = [];
  let s: ApplicationSnapshot = { ...snapshot };

  // Pass 1: drop narrative descriptions (the schema marks these optional,
  // so omitting them keeps the SnapshotXxx contract intact).
  if (s.workExperiences) {
    s = {
      ...s,
      workExperiences: s.workExperiences.map((w) => {
        const out: SnapshotWorkExperience = { ...w };
        delete out.description;
        return out;
      }),
    };
    dropped.push("workExperiences[].description");
  }
  if (s.projects) {
    s = {
      ...s,
      projects: s.projects.map((p) => {
        const out: SnapshotProject = { ...p };
        delete out.description;
        return out;
      }),
    };
    dropped.push("projects[].description");
  }
  if (s.educationEntries) {
    s = {
      ...s,
      educationEntries: s.educationEntries.map((e) => {
        const out: SnapshotEducationEntry = { ...e };
        delete out.activities;
        return out;
      }),
    };
    dropped.push("educationEntries[].activities");
  }
  serialized = JSON.stringify(s);

  // Pass 2: drop entire child arrays LIFO (educationEntries → projects → certifications → workExperiences)
  const order: Array<keyof ApplicationSnapshot> = [
    "educationEntries",
    "projects",
    "certifications",
    "workExperiences",
  ];
  for (const key of order) {
    if (serialized.length <= MAX_SNAPSHOT_BYTES) break;
    if (s[key] !== undefined) {
      s = { ...s, [key]: undefined };
      dropped.push(String(key));
      serialized = JSON.stringify(s);
    }
  }

  console.warn(
    `[apply] Snapshot for ${applicationId} exceeded ${MAX_SNAPSHOT_BYTES}B; ` +
      `dropped fields: ${dropped.join(", ")} (final size: ${serialized.length}B)`
  );
  return s;
}

const COUNTRY_ALIASES: Record<string, string> = {
  "us": "United States",
  "usa": "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  "uk": "United Kingdom",
  "gb": "United Kingdom",
  "great britain": "United Kingdom",
  "england": "United Kingdom",
  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  "de": "Germany",
  "deutschland": "Germany",
  "fr": "France",
  "au": "Australia",
  "nz": "New Zealand",
  "br": "Brazil",
  "brasil": "Brazil",
  "mx": "Mexico",
  "méxico": "Mexico",
  "in": "India",
  "jp": "Japan",
  "cn": "China",
  "kr": "South Korea",
  "south korea": "South Korea",
  "s. korea": "South Korea",
  "s.korea": "South Korea",
  "sg": "Singapore",
  "nl": "Netherlands",
  "the netherlands": "Netherlands",
  "es": "Spain",
  "españa": "Spain",
  "it": "Italy",
  "italia": "Italy",
  "se": "Sweden",
  "no": "Norway",
  "dk": "Denmark",
  "fi": "Finland",
  "pl": "Poland",
  "ch": "Switzerland",
  "at": "Austria",
  "be": "Belgium",
  "pt": "Portugal",
  "ie": "Ireland",
  "il": "Israel",
  "tr": "Turkey",
  "türkiye": "Turkey",
  "za": "South Africa",
  "ng": "Nigeria",
  "ke": "Kenya",
  "eg": "Egypt",
  "ar": "Argentina",
  "cl": "Chile",
  "co": "Colombia",
  "pe": "Peru",
  "ph": "Philippines",
  "id": "Indonesia",
  "my": "Malaysia",
  "th": "Thailand",
  "vn": "Vietnam",
  "pk": "Pakistan",
  "bd": "Bangladesh",
  "hk": "Hong Kong",
  "tw": "Taiwan",
}

function normalizeCountry(raw: string): string {
  const key = raw.toLowerCase().trim()
  return COUNTRY_ALIASES[key] ?? raw
}

/** Map NormalizedFieldType → Greenhouse field type string for snapshot compat */
function toGreenhouseFieldType(
  ft: NormalizedFieldType
): "input_text" | "input_file" | "textarea" | "multi_value_single_select" | "multi_value_multi_select" {
  switch (ft) {
    case "select":
    case "boolean":
      return "multi_value_single_select";
    case "multiselect":
      return "multi_value_multi_select";
    case "textarea":
      return "textarea";
    case "file":
      return "input_file";
    default:
      return "input_text";
  }
}

/** Convert normalized options to selectValues for snapshot.
 *  Preserves original value type — Ashby uses string IDs (e.g. UUIDs),
 *  Greenhouse uses numeric IDs. Coercing to Number() corrupts non-numeric values to NaN. */
function toSelectValues(
  options?: ReadonlyArray<{ value: string; label: string }>
): Array<{ value: string | number; label: string }> | undefined {
  if (!options || options.length === 0) return undefined;
  return options.map((o) => {
    const asNum = Number(o.value);
    // Keep as number only if the original is purely numeric (Greenhouse compat)
    const value = !isNaN(asNum) && String(asNum) === o.value ? asNum : o.value;
    return { value, label: o.label };
  });
}

/** Map UserProfile → QuestionMatchProfile for ATS-agnostic question matching */
function toMatchProfile(profile: ProfileWithRelations): QuestionMatchProfile {
  return {
    linkedInUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    websiteUrl: profile.portfolioUrl,
    phone: profile.phone,
    location: profile.location,
    locationFormatted: profile.locationFormatted,
    locationState: profile.locationState,
    currentCompany: profile.currentCompany,
    currentTitle: profile.currentTitle,
    university: profile.university,
    highestDegree: profile.highestDegree,
    preferredFirstName: profile.preferredFirstName,
    sponsorshipRequired: profile.requiresSponsorship,
    workAuthorized: !!profile.workAuthorization,
    openToRemote: profile.openToRemote,
    // Phase 4 — registry-backed scalars + child collections
    noticePeriodWeeks: profile.noticePeriodWeeks,
    earliestStartDate: profile.earliestStartDate,
    hasDriversLicense: profile.hasDriversLicense,
    willingBackgroundCheck: profile.willingBackgroundCheck,
    willingDrugTest: profile.willingDrugTest,
    securityClearance: profile.securityClearance,
    searchStatus: profile.searchStatus,
    coverLetterIntro: profile.coverLetterIntro,
    whyImLookingTemplate: profile.whyImLookingTemplate,
    spokenLanguages: profile.spokenLanguages.map((l) => ({ name: l.name })),
    eligibleCountries: profile.eligibleCountries,
  };
}

function buildSnapshot(
  profile: ProfileWithRelations,
  boardToken: string,
  externalId: string,
  questions: readonly NormalizedQuestion[],
  questionAnswers: Record<string, string | number>,
  trackingEmail: string,
  applicationId: string,
  manualApplyUrl?: string
): ApplicationSnapshot {
  // Extract Spaces key from resumeUrl (not a presigned URL — stable reference)
  const resumeSpacesKey = profile.resumeUrl
    ? profile.resumeUrl.split(".digitaloceanspaces.com/")[1] ?? undefined
    : undefined;

  const stringAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(questionAnswers)) {
    stringAnswers[k] = String(v);
  }

  // Build questionMeta: one entry per answered normalized question
  const questionMeta: QuestionMeta[] = [];
  for (const question of questions) {
    if (!(question.id in stringAnswers)) continue;
    const ghFieldType = toGreenhouseFieldType(question.fieldType);
    questionMeta.push({
      label: question.label,
      fieldName: question.id,
      fieldType: ghFieldType,
      ...(ghFieldType === "multi_value_single_select" || ghFieldType === "multi_value_multi_select"
        ? { selectValues: toSelectValues(question.options) }
        : {}),
    });
  }

  // Build pendingQuestions: unanswered questions for operator/extension
  const matchProfile = toMatchProfile(profile);
  const unanswered = getUnansweredQuestions(questions, matchProfile, stringAnswers);
  const pendingQuestions: PendingQuestion[] = unanswered.map((q) => {
    const ghFieldType = toGreenhouseFieldType(q.fieldType);
    return {
      label: q.label,
      fieldName: q.id,
      fieldType: ghFieldType,
      required: q.required,
      description: q.description,
      ...(ghFieldType === "multi_value_single_select" || ghFieldType === "multi_value_multi_select"
        ? { selectValues: toSelectValues(q.options) }
        : {}),
      ...(q.id && stringAnswers[q.id] ? { userAnswer: stringAnswers[q.id] } : {}),
    };
  });

  // Build coreFieldExtras: preferred name, country, EEOC for extension/operator
  const countryRaw = (profile.locationFormatted ?? profile.location ?? "").split(",").at(-1)?.trim() || undefined;
  const coreFieldExtras: ApplicationSnapshot["coreFieldExtras"] = {};
  if (profile.preferredFirstName) coreFieldExtras.preferredFirstName = profile.preferredFirstName;
  if (countryRaw) coreFieldExtras.country = normalizeCountry(countryRaw);
  if (profile.linkedinUrl) coreFieldExtras.linkedIn = profile.linkedinUrl;
  if (profile.githubUrl) coreFieldExtras.github = profile.githubUrl;
  if (profile.portfolioUrl) coreFieldExtras.website = profile.portfolioUrl;
  // Always emit a null EEOC block so the extension/operator triggers
  // "decline to answer" on Greenhouse/Ashby EEOC fields. We don't collect
  // EEOC data from users, but we still need to signal opt-out at apply time.
  coreFieldExtras.eeoc = {
    gender: undefined,
    race: undefined,
    veteranStatus: undefined,
    disability: undefined,
  };

  // ── Phase 4: extended profile data (scalars + child collections) ─────────
  const skills: SnapshotSkill[] = profile.skills.map((s) =>
    compact({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      yearsUsed: s.yearsUsed ?? undefined,
    }) as SnapshotSkill
  );

  const workExperiences: SnapshotWorkExperience[] = profile.workExperiences.map(
    (w) =>
      compact({
        title: w.title,
        company: w.company,
        startDate: dateISO(w.startDate)!,
        endDate: dateISO(w.endDate),
        isCurrent: w.isCurrent,
        location: w.location ?? undefined,
        employmentType: w.employmentType,
        description: w.description ?? undefined,
      }) as SnapshotWorkExperience
  );

  const educationEntries: SnapshotEducationEntry[] = profile.educationEntries.map(
    (e) =>
      compact({
        schoolName: e.schoolName ?? undefined,
        degree: e.degree,
        fieldOfStudy: e.fieldOfStudy,
        startYear: e.startYear ?? undefined,
        endYear: e.endYear ?? undefined,
        gpa: e.gpa ?? undefined,
        honors: e.honors ?? undefined,
        activities: e.activities ?? undefined,
      }) as SnapshotEducationEntry
  );

  const projects: SnapshotProject[] = profile.projects.map((p) =>
    compact({
      name: p.name,
      url: p.url ?? undefined,
      repoUrl: p.repoUrl ?? undefined,
      description: p.description ?? undefined,
      technologies: p.technologies,
      role: p.role ?? undefined,
    }) as SnapshotProject
  );

  const certifications: SnapshotCertification[] = profile.certifications.map(
    (c) =>
      compact({
        name: c.name,
        issuer: c.issuer,
        issueDate: dateISO(c.issueDate),
        expiryDate: dateISO(c.expiryDate),
        credentialUrl: c.credentialUrl ?? undefined,
        credentialId: c.credentialId ?? undefined,
      }) as SnapshotCertification
  );

  const languages: SnapshotLanguage[] = profile.spokenLanguages.map((l) => ({
    name: l.name,
    proficiency: l.proficiency,
  }));

  // Build the snapshot with v2 discriminator + Phase-4 fields. compact()
  // strips empty arrays / null strings so JSON stays compact.
  const phase4Extras = compact({
    twitterUrl: profile.twitterUrl ?? undefined,
    stackOverflowUrl: profile.stackOverflowUrl ?? undefined,
    dribbbleUrl: profile.dribbbleUrl ?? undefined,
    behanceUrl: profile.behanceUrl ?? undefined,
    mediumUrl: profile.mediumUrl ?? undefined,
    devToUrl: profile.devToUrl ?? undefined,
    googleScholarUrl: profile.googleScholarUrl ?? undefined,
    huggingFaceUrl: profile.huggingFaceUrl ?? undefined,
    kaggleUrl: profile.kaggleUrl ?? undefined,
    youtubeUrl: profile.youtubeUrl ?? undefined,
    noticePeriodWeeks: profile.noticePeriodWeeks ?? undefined,
    earliestStartDate: dateISO(profile.earliestStartDate)?.slice(0, 10),
    targetRoles: profile.targetRoles,
    targetIndustries: profile.targetIndustries,
    companySizePreferences: profile.companySizePreferences,
    relocationOpen: profile.relocationOpen,
    relocationCities: profile.relocationCities,
    currencyPreference: profile.currencyPreference,
    equityImportance: profile.equityImportance ?? undefined,
    desiredEmploymentTypes: profile.desiredEmploymentTypes,
    searchStatus: profile.searchStatus,
    hasDriversLicense: profile.hasDriversLicense ?? undefined,
    willingBackgroundCheck: profile.willingBackgroundCheck ?? undefined,
    willingDrugTest: profile.willingDrugTest ?? undefined,
    securityClearance: profile.securityClearance,
    eligibleCountries: profile.eligibleCountries,
    coverLetterIntro: profile.coverLetterIntro ?? undefined,
    whyImLookingTemplate: profile.whyImLookingTemplate ?? undefined,
    skills,
    workExperiences,
    educationEntries,
    projects,
    certifications,
    languages,
  });

  const snapshot: ApplicationSnapshot = {
    version: 2,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone ?? undefined,
    location: profile.locationFormatted ?? profile.location ?? undefined,
    boardToken,
    externalId,
    manualApplyUrl,
    resumeFileName: profile.resumeFileName ?? undefined,
    resumeSpacesKey,
    trackingEmail,
    questionAnswers: stringAnswers,
    questionMeta,
    pendingQuestions,
    snapshotAt: new Date().toISOString(),
    ...(Object.keys(coreFieldExtras).length > 0 ? { coreFieldExtras } : {}),
    ...phase4Extras,
  };

  return trimSnapshotToFit(snapshot, applicationId);
}

const applySchema = z.object({
  jobId: z.string().min(1),
  additionalAnswers: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional(),
});

async function runPlaywrightSubmission(opts: {
  applicationId: string;
  provider: AtsProvider;
  boardToken: string;
  externalJobId: string;
  applyUrl: string | null;
  applySelector: string | null;
  profile: ProfileWithRelations;
  trackingEmail: string;
  resumeBuffer: Buffer | undefined;
  resumeFileName: string;
  questionAnswers: Record<string, string | number>;
  questions: readonly NormalizedQuestion[];
  userId: string;
  jobTitle: string;
  companyName: string;
  userEmail: string | null;
  userName: string;
}): Promise<void> {
  try {
    initializeAtsProviders();
    const strategy = getApplyStrategy(opts.provider);
    const applyResult = await strategy.apply({
      boardToken: opts.boardToken,
      jobExternalId: opts.externalJobId,
      applyUrl: opts.applyUrl ?? (opts.provider === "ASHBY"
        ? `https://jobs.ashbyhq.com/${opts.boardToken}/${opts.externalJobId}/application`
        : `https://boards.greenhouse.io/${opts.boardToken}/jobs/${opts.externalJobId}`),
      applySelector: opts.applySelector,
      profile: {
        firstName: opts.profile.firstName,
        lastName: opts.profile.lastName,
        email: opts.profile.email,
        phone: opts.profile.phone,
        location: opts.profile.locationFormatted ?? opts.profile.location ?? null,
        linkedInUrl: opts.profile.linkedinUrl ?? null,
        githubUrl: opts.profile.githubUrl ?? null,
        websiteUrl: opts.profile.portfolioUrl ?? null,
        preferredFirstName: opts.profile.preferredFirstName,
      },
      trackingEmail: opts.trackingEmail,
      resumeBuffer: opts.resumeBuffer,
      resumeFileName: opts.resumeFileName,
      questionAnswers: opts.questionAnswers,
    });

    if (applyResult.success) {
      await db.application.update({
        where: { id: opts.applicationId },
        data: {
          submissionStatus: "SUBMITTED",
          externalApplicationId: applyResult.applicationId ?? null,
        },
      });
      await db.applicationStatusHistory.create({
        data: {
          applicationId: opts.applicationId,
          toStatus: "APPLIED",
          reason: `Application submitted to ${opts.provider} successfully`,
          triggeredBy: "system",
        },
      });
      if (opts.userEmail) {
        sendApplyConfirmation({
          userEmail: opts.userEmail,
          userName: opts.userName,
          jobTitle: opts.jobTitle,
          companyName: opts.companyName,
          appUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard`,
        });
      }
      createNotification({
        userId: opts.userId,
        type: "APPLIED",
        title: `Applied to ${opts.jobTitle} at ${opts.companyName}`,
        body: "Your application was submitted successfully.",
        ctaUrl: `/dashboard?app=${opts.applicationId}`,
        ctaLabel: "View Dashboard",
        applicationId: opts.applicationId,
        dedupeKey: `APPLIED:${opts.applicationId}`,
        suppressEmail: true,
      }).catch((err: unknown) => {
        console.error("[notifications] APPLIED notification failed:", err);
      });
    } else {
      const errorCode = applyResult.errorCode ?? "PLAYWRIGHT_ERROR";

      if (OPERATOR_QUEUE_CODES.has(errorCode)) {
        // Route to operator queue — do NOT send APPLY_FAILED notification
        // User-facing dashboard shows "Finalizing submission" for AWAITING_OPERATOR
        const snapshot = buildSnapshot(
          opts.profile,
          opts.boardToken,
          opts.externalJobId,
          opts.questions,
          opts.questionAnswers,
          opts.trackingEmail,
          opts.applicationId,
          applyResult.manualApplyUrl
        );

        await db.application.update({
          where: { id: opts.applicationId },
          data: {
            submissionStatus: "AWAITING_OPERATOR",
            submissionError: errorCode,
            applicationSnapshot: snapshot as object,
          },
        });

        await db.applicationAuditLog.create({
          data: {
            applicationId: opts.applicationId,
            action: "PLAYWRIGHT_RESULT",
            metadata: { errorCode, manualApplyUrl: applyResult.manualApplyUrl ?? null },
          },
        });

        // Generate the Q&A summary PDF for the operator. Failures here must
        // never block queue routing — log and continue. Idempotent on
        // (applicationId, OPERATOR_SUMMARY).
        try {
          await generateAndAttachOperatorSummary({
            applicationId: opts.applicationId,
            jobTitle: opts.jobTitle,
            companyName: opts.companyName,
            applyUrl: opts.applyUrl ?? applyResult.manualApplyUrl ?? null,
            snapshot: snapshot as unknown as Record<string, unknown>,
            actorUserId: null,
          });
        } catch (pdfErr) {
          console.error("[apply] operator summary PDF generation failed:", pdfErr);
          Sentry.captureException(pdfErr);
          await db.applicationAuditLog
            .create({
              data: {
                applicationId: opts.applicationId,
                action: "PDF_GENERATION_FAILED",
                metadata: {
                  reason: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
                },
              },
            })
            .catch((auditErr: unknown) => {
              console.error("[apply] failed to write PDF_GENERATION_FAILED audit:", auditErr);
            });
        }

        const requiredPending = snapshot.pendingQuestions.filter((q) => q.required && !q.userAnswer);
        if (requiredPending.length > 0) {
          createNotification({
            userId: opts.userId,
            type: "SYSTEM",
            title: `Action required: answer ${requiredPending.length} question${requiredPending.length !== 1 ? "s" : ""} to complete your application`,
            body: `Your application to ${opts.jobTitle} at ${opts.companyName} needs ${requiredPending.length} additional answer${requiredPending.length !== 1 ? "s" : ""} before it can be submitted.`,
            ctaUrl: `/applications/${opts.applicationId}/questions`,
            ctaLabel: "Answer Questions",
            applicationId: opts.applicationId,
          }).catch((err: unknown) => {
            console.error("[notifications] pending questions notification failed:", err);
          });
        }
      } else {
        // Terminal failure — not recoverable by operator
        await db.application.update({
          where: { id: opts.applicationId },
          data: {
            submissionStatus: "FAILED",
            submissionError: applyResult.error ?? errorCode,
          },
        });

        createNotification({
          userId: opts.userId,
          type: "APPLIED",
          title: `Action required: ${opts.jobTitle} at ${opts.companyName}`,
          body: "Automation failed to submit your application. Please apply manually via the job link.",
          ctaUrl: applyResult.manualApplyUrl ?? `/dashboard?app=${opts.applicationId}`,
          ctaLabel: "View Job",
          applicationId: opts.applicationId,
          dedupeKey: `APPLY_FAILED:${opts.applicationId}`,
          suppressEmail: false,
        }).catch((err: unknown) => {
          console.error("[notifications] APPLY_FAILED notification failed:", err);
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Playwright crashed";
    console.error("[apply] Background submission error:", err);
    Sentry.captureException(err);
    await db.application
      .update({
        where: { id: opts.applicationId },
        data: { submissionStatus: "FAILED", submissionError: msg },
      })
      .catch((dbErr: unknown) => {
        console.error("[apply] Failed to persist submission error:", dbErr);
      });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const applications = await db.application.findMany({
    where: { userId: session.user.id },
    include: {
      job: { include: { company: true } },
      emails: { orderBy: { receivedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { appliedAt: "desc" },
  });

  return NextResponse.json<ApiResponse<ApplicationWithJob[]>>({
    success: true,
    data: applications as ApplicationWithJob[],
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Invalid request" }, { status: 400 });
  }

  // Get job and profile (with Phase-4 child relations for the fill-package snapshot)
  const [job, profile] = await Promise.all([
    db.job.findUnique({ where: { id: parsed.data.jobId }, include: { company: true } }),
    db.userProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        skills: { orderBy: { order: "asc" }, take: 20 },
        workExperiences: {
          orderBy: [{ order: "asc" }, { startDate: "desc" }],
          take: 5,
        },
        educationEntries: { orderBy: { order: "asc" }, take: 3 },
        projects: { orderBy: { order: "asc" }, take: 5 },
        certifications: { orderBy: { order: "asc" } },
        spokenLanguages: { orderBy: { order: "asc" } },
      },
    }),
  ]);

  if (!job) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Job not found" }, { status: 404 });
  }

  if (!profile?.isComplete) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Please complete your profile before applying" },
      { status: 400 }
    );
  }

  // Check A — isActive guard: bail early if job is marked inactive in DB
  if (!job.isActive) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: "This job listing is no longer active. It may have been filled or removed.",
      },
      { status: 422 }
    );
  }

  // Check B — URL redirect probe: lightweight HEAD to detect closed/redirected listings
  if (job.absoluteUrl) {
    try {
      const probeRes = await fetch(job.absoluteUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });

      const isRedirect = probeRes.status >= 300 && probeRes.status < 400;
      if (isRedirect) {
        const location = probeRes.headers.get("location") ?? "";
        const isGreenhouseRedirect =
          location.startsWith("/") || // relative redirect = still on Greenhouse's domain
          location.includes("greenhouse.io") ||
          location.includes("job-boards");

        if (!isGreenhouseRedirect) {
          // Job redirects away from Greenhouse — mark inactive and reject
          await db.job.update({
            where: { id: job.id },
            data: { isActive: false },
          });
          return NextResponse.json<ApiResponse<never>>(
            {
              success: false,
              error: "This job listing appears to have been removed. We've updated our records.",
            },
            { status: 422 }
          );
        }
      } else if ([404, 410, 451].includes(probeRes.status)) {
        // Definitive "gone" response — mark inactive and reject
        await db.job.update({
          where: { id: job.id },
          data: { isActive: false },
        });
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            error: "This job listing appears to have been removed. We've updated our records.",
          },
          { status: 422 }
        );
      }
      // All other non-2xx responses (405, 501, 503, etc.) — fail open, Greenhouse doesn't support HEAD
    } catch {
      // Probe timed out or errored — fail open, proceed with Playwright submission
    }
  }

  // Check if already applied
  const existing = await db.application.findUnique({
    where: { userId_jobId: { userId: session.user.id, jobId: job.id } },
  });
  if (existing) {
    const duplicateMessage =
      existing.status === "WITHDRAWN"
        ? "You withdrew this application and cannot re-apply to this job."
        : "You have already applied to this job";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: duplicateMessage },
      { status: 409 }
    );
  }

  // Check and consume credit before hitting Greenhouse
  const creditCheck = await checkAndConsumeCredit(session.user.id);
  if (!creditCheck.allowed) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: `Free tier limit reached (${FREE_TIER_CREDITS} applications per 24 hours). Upgrade for unlimited applications.`,
        resetsAt: creditCheck.resetsAt.toISOString(),
      },
      { status: 402 }
    );
  }

  // Step 1: Create Application record to get the real ID
  const application = await db.application.create({
    data: {
      userId: session.user.id,
      jobId: job.id,
      status: "APPLIED",
      externalApplicationId: null,
      trackingEmail: generateTrackingEmail(`${session.user.id.slice(0, 8)}-${job.id.slice(0, 8)}`),
    },
  });

  // Referral conversion: award referrer credits on referee's first application
  if (await isFirstApplication(session.user.id)) {
    void handleFirstApplicationConversion(session.user.id).catch((err: unknown) => {
      console.error("[referral] conversion error:", err)
    })
  }

  // Step 2: Generate tracking email from real ID and persist immediately
  const trackingEmail = generateTrackingEmail(application.id);
  await db.application.update({
    where: { id: application.id },
    data: { trackingEmail },
  });

  // Resolve resume: DB bytes (current) or DO Spaces URL (production)
  let resumeBuffer: Buffer | undefined;
  if (profile.resumeData) {
    resumeBuffer = Buffer.from(profile.resumeData);
  } else if (profile.resumeUrl) {
    try {
      const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
      const presignedUrl = key ? await getPresignedGetUrl(key, 300) : null;
      if (presignedUrl) {
        const res = await fetch(presignedUrl);
        if (res.ok) resumeBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      // Non-fatal: proceed without resume if fetch fails
    }
  }

  // Build question answers: auto-answer from profile, then overlay user-provided answers
  // Skip stale Greenhouse-format cached questions (they lack `id`/`fieldType` fields)
  let storedQuestions: NormalizedQuestion[] = [];
  if (job.applicationQuestions) {
    const cached = job.applicationQuestions as unknown as Record<string, unknown>[];
    const isNormalized = cached.length === 0 || ("id" in cached[0] && "fieldType" in cached[0]);
    if (isNormalized) {
      storedQuestions = cached as unknown as NormalizedQuestion[];
    }
  }

  const matchProfile = toMatchProfile(profile);
  const questionAnswers: Record<string, string | number> = {};
  for (const question of storedQuestions) {
    const answer = autoAnswerQuestion(question, matchProfile);
    if (answer !== null) questionAnswers[question.id] = answer;
  }
  Object.assign(questionAnswers, parsed.data.additionalAnswers ?? {});

  // Fetch user for email/name (needed by background task)
  const user = await db.user.findUnique({ where: { id: session.user.id } });

  // Fire Playwright submission in background — do NOT await.
  // DO App Platform has a hard 30s HTTP timeout; Playwright takes 30-60s.
  // We return 200 immediately; the background task updates the DB when done.
  void runPlaywrightSubmission({
    applicationId: application.id,
    provider: job.provider ?? "GREENHOUSE",
    boardToken: job.boardToken,
    externalJobId: job.externalId,
    // Prefer the dedicated applyUrl (rewritten to a live custom-domain
    // page for Ashby self-hosters). Fall back to absoluteUrl for legacy
    // rows that pre-date the A.1 column. The route.ts:310 fallback
    // handles the still-null case for hosted Ashby/Greenhouse.
    applyUrl: job.applyUrl ?? job.absoluteUrl,
    // Per-company override for the apply trigger button selector
    // (Track A.2 of HARDENING_PLAN.md). Null for the vast majority of
    // companies — the generic chain handles them.
    applySelector: job.company.applySelector ?? null,
    profile,
    trackingEmail,
    resumeBuffer,
    resumeFileName: profile.resumeFileName ?? "resume.pdf",
    questionAnswers,
    questions: storedQuestions,
    userId: session.user.id,
    jobTitle: job.title,
    companyName: job.company.name,
    userEmail: user?.email ?? null,
    userName: user?.name ?? profile.firstName,
  });

  return NextResponse.json<ApiResponse<{ applicationId: string }>>({
    success: true,
    data: { applicationId: application.id },
  });
}
