import type { NormalizedQuestion } from "./types";

// ─── Profile interface ───────────────────────────────────────────────────────

/**
 * Profile data used to auto-answer application questions.
 * Intentionally decoupled from Prisma's UserProfile so any ATS provider
 * can map its own profile shape into this interface.
 */
export interface QuestionMatchProfile {
  linkedInUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  phone?: string | null;
  location?: string | null;
  locationFormatted?: string | null;
  locationState?: string | null;
  currentCompany?: string | null;
  currentTitle?: string | null;
  university?: string | null;
  highestDegree?: string | null;
  preferredFirstName?: string | null;
  sponsorshipRequired?: boolean;
  workAuthorized?: boolean;
  openToRemote?: boolean;
  // EEOC / demographic
  gender?: string | null;
  race?: string | null;
  veteranStatus?: string | null;
  disability?: string | null;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Pick the option whose label matches `targetLabel` (case-insensitive). */
function findOption(
  options: ReadonlyArray<{ value: string; label: string }>,
  targetLabel: string
): string | null {
  const match = options.find(
    (o) => o.label.toLowerCase() === targetLabel.toLowerCase()
  );
  return match?.value ?? null;
}

function resolveYesNo(
  options: ReadonlyArray<{ value: string; label: string }>,
  wantYes: boolean
): string | null {
  const target = wantYes ? "yes" : "no";
  return findOption(options, target);
}

/**
 * Match a demographic (EEOC) value against available options.
 * Falls back to "Decline to Self Identify" / "Prefer not to say" if
 * the profile value doesn't match any option exactly.
 */
function matchDemographic(
  options: ReadonlyArray<{ value: string; label: string }>,
  profileValue: string | null | undefined
): string | null {
  if (profileValue) {
    const exact = findOption(options, profileValue);
    if (exact !== null) return exact;
  }

  // Decline fallback
  const declinePatterns = [
    /decline/i,
    /prefer not/i,
    /choose not/i,
    /not to (self[- ])?identify/i,
    /not to disclose/i,
  ];
  for (const opt of options) {
    if (declinePatterns.some((p) => p.test(opt.label))) {
      return opt.value;
    }
  }
  return null;
}

// ─── Core field detection ────────────────────────────────────────────────────

const CORE_FIELD_PATTERNS: readonly RegExp[] = [
  /^first name$/i,
  /^last name$/i,
  /^email$/i,
  /^email address$/i,
  /^phone$/i,
  /^phone number$/i,
  /\bresume\b/i,
  /\bcv\b/i,
  /\bcover letter\b/i,
];

/**
 * Identify core/system fields that are filled separately from custom questions
 * (first name, last name, email, phone, resume, cover letter).
 * Note: "Preferred First Name" is NOT a core field.
 */
export function isCoreField(question: NormalizedQuestion): boolean {
  const l = question.label.toLowerCase();

  // Ashby uses "Full Name" instead of separate first/last
  if (l === "full name") return true;
  // "First Name" but NOT "Preferred First Name"
  if (l.includes("first name") && !l.includes("preferred")) return true;
  if (l.includes("last name")) return true;
  if (l === "email" || l.includes("email address")) return true;
  if (l === "phone" || l.includes("phone number")) return true;
  if (/\bresume\b/.test(l) || l === "cv" || l.includes(" cv")) return true;
  if (l.includes("cover letter")) return true;

  return false;
}

// ─── Auto-answer logic ───────────────────────────────────────────────────────

/**
 * Auto-answer a normalized question based on profile data and label heuristics.
 * Returns the answer value if we can determine one, or null if we cannot.
 *
 * These heuristics are ATS-agnostic — they pattern-match on the question
 * label text which is consistent across providers.
 */
export function autoAnswerQuestion(
  question: NormalizedQuestion,
  profile: QuestionMatchProfile
): string | null {
  const label = question.label.toLowerCase();
  const opts = question.options ?? [];

  // Skip core fields — handled at the top-level form level
  if (isCoreField(question)) return null;

  // --- URL / social links ---
  if (label.includes("linkedin")) {
    return profile.linkedInUrl ?? null;
  }

  if (label.includes("github")) {
    return profile.githubUrl ?? null;
  }

  if (label.includes("website") || label.includes("portfolio")) {
    return profile.websiteUrl ?? null;
  }

  // --- Sponsorship ---
  if (/sponsor|visa sponsorship/i.test(question.label)) {
    // If sponsorship preference is unknown (undefined/null), do NOT default to "false".
    // Defaulting silently hides the question from operator and modal.
    // Instead return null so the question surfaces as pending for explicit resolution.
    if (profile.sponsorshipRequired == null) return null;

    // Ashby renders this as a boolean toggle (true/false), not a select
    if (question.fieldType === "boolean") {
      return profile.sponsorshipRequired ? "true" : "false";
    }
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, profile.sponsorshipRequired);
  }

  // --- Work authorization ---
  if (/authorized to work|authorization to work/i.test(question.label)) {
    if (profile.workAuthorized == null) return null;
    if (question.fieldType === "boolean") {
      return profile.workAuthorized ? "true" : "false";
    }
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, profile.workAuthorized);
  }

  // --- Current / previous employer ---
  if (
    /current.*employer|previous.*employer|current or previous employer/i.test(
      question.label
    )
  ) {
    return profile.currentCompany ?? null;
  }

  // --- Current / previous title ---
  if (/current.*title|previous.*title|job title/i.test(question.label)) {
    return profile.currentTitle ?? null;
  }

  // --- Education ---
  if (/school|university/i.test(question.label)) {
    return profile.university ?? null;
  }

  if (/degree/i.test(question.label)) {
    return profile.highestDegree ?? null;
  }

  // --- Location / city+state ---
  if (
    /city.*state|city and state|address.*work|plan.*working/i.test(
      question.label
    )
  ) {
    return profile.location ?? null;
  }

  // --- Country of residence (select) ---
  if (/\bcountry\b|country of res|currently based/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;

    const usAliases = [
      "usa",
      "us",
      "united states",
      "united states of america",
    ];
    const lastSegment =
      (profile.locationFormatted ?? profile.location ?? "")
        .split(",")
        .at(-1)
        ?.trim() ?? "";
    const isUS =
      !!profile.locationState ||
      usAliases.includes(lastSegment.toLowerCase());
    const targetLabel = isUS ? "United States" : lastSegment;
    if (!targetLabel) return null;

    const match = opts.find(
      (o) =>
        o.label.toLowerCase() === targetLabel.toLowerCase() ||
        (isUS && usAliases.includes(o.label.toLowerCase()))
    );
    if (match) return match.value;

    // Fall back to "Other"
    return findOption(opts, "Other");
  }

  // --- Remote preference ---
  if (/plan.*work remotely|intend.*remote/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, profile.openToRemote ?? true);
  }

  // --- WhatsApp / SMS opt-in → always No ---
  if (/whatsapp|sms opt/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, false);
  }

  // --- AI policy acknowledgment → always Yes ---
  if (/ai policy|ai partnership/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, true);
  }

  // --- Single-option acknowledgments (privacy notice, data review, etc.) ---
  if (/privacy notice|data.*review|have reviewed/i.test(question.label)) {
    if (question.fieldType === "select" && opts.length === 1) {
      return opts[0].value;
    }
    return null;
  }

  // --- Previously employed → No ---
  if (
    /previously.*employ|employed by.*before|been employed by/i.test(
      question.label
    )
  ) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, false);
  }

  // --- Interviewed before → No ---
  if (/interviewed.*before|interviewed at/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return resolveYesNo(opts, false);
  }

  // --- Preferred first name / nickname ---
  if (/preferred.*name|preferred.*first|nickname/i.test(question.label)) {
    if (question.fieldType !== "text") return null;
    return profile.preferredFirstName ?? null;
  }

  // --- Pronouns ---
  // No auto-answer: pronouns are personal and not stored in profile.
  // Returning null ensures the question surfaces as pending for operator/user.
  if (/\bpronoun/i.test(question.label)) {
    return null;
  }

  // --- EEOC: gender identity ---
  if (/\bgender\b/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return matchDemographic(opts, profile.gender);
  }

  // --- EEOC: race / ethnicity ---
  if (/\brace\b|\bethnicity\b/i.test(question.label)) {
    if (
      question.fieldType !== "select" &&
      question.fieldType !== "multiselect"
    )
      return null;
    if (opts.length === 0) return null;
    return matchDemographic(opts, profile.race);
  }

  // --- EEOC: veteran status ---
  if (/\bveteran\b/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return matchDemographic(opts, profile.veteranStatus);
  }

  // --- EEOC: disability ---
  if (/disabilit/i.test(question.label)) {
    if (question.fieldType !== "select" || opts.length === 0) return null;
    return matchDemographic(opts, profile.disability);
  }

  return null;
}

// ─── Unanswered question filter ──────────────────────────────────────────────

/** Strip HTML tags from description text. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Return questions that were not auto-answered, are not core fields,
 * and were not already provided in `providedAnswers`.
 */
export function getUnansweredQuestions(
  questions: readonly NormalizedQuestion[],
  profile: QuestionMatchProfile,
  providedAnswers?: Record<string, string | number>
): NormalizedQuestion[] {
  return questions.filter((q) => {
    if (isCoreField(q)) return false;
    if (autoAnswerQuestion(q, profile) !== null) return false;
    if (providedAnswers && q.id in providedAnswers) return false;
    return true;
  });
}
