import type { UserProfile } from "@prisma/client";
import type { GreenhouseQuestion, GreenhouseQuestionField } from "@/types";

// --- Helpers ---

function resolveYesNo(
  field: GreenhouseQuestionField,
  wantYes: boolean
): number | null {
  const yes = field.values.find((v) => v.label.toLowerCase() === "yes");
  const no = field.values.find((v) => v.label.toLowerCase() === "no");
  const target = wantYes ? yes : no;
  return target?.value ?? null;
}

// Return true if a question is a core field we skip entirely (handled as top-level form fields)
function isCoreField(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("first name") ||
    l.includes("last name") ||
    l === "email" ||
    l.includes("email address") ||
    l === "phone" ||
    l.includes("phone number") ||
    l.includes("resume") ||
    l.includes(" cv") ||
    l === "cv" ||
    l.includes("cover letter")
  );
}

// Strip HTML tags from description text
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Finds the best matching value from a Greenhouse select values array
 * by comparing the stored string label against available option labels.
 * Tries: exact match → case-insensitive exact → one contains the other → key word overlap.
 */
function fuzzyMatchValue(
  stored: string,
  values: Array<{ value: number; label: string }>
): number | null {
  const s = stored.toLowerCase().trim();

  // Exact (case-insensitive)
  const exact = values.find((v) => v.label.toLowerCase().trim() === s);
  if (exact) return exact.value;

  // One contains the other
  const contains = values.find(
    (v) =>
      v.label.toLowerCase().includes(s) || s.includes(v.label.toLowerCase().trim())
  );
  if (contains) return contains.value;

  // Key word overlap: split both into words, count matches
  const storedWords = new Set(s.split(/\W+/).filter(Boolean));
  let bestScore = 0;
  let bestValue: number | null = null;
  for (const v of values) {
    const vWords = v.label.toLowerCase().split(/\W+/).filter(Boolean);
    const overlap = vWords.filter((w) => storedWords.has(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestValue = v.value;
    }
  }
  if (bestScore >= 2) return bestValue;

  return null;
}

/**
 * Auto-answer a single question from the user profile.
 * Returns { fieldName: value } map if we can answer it, or null if we cannot.
 */
export function autoAnswerQuestion(
  question: GreenhouseQuestion,
  profile: UserProfile
): Record<string, string | number> | null {
  const label = question.label.toLowerCase();

  // Skip core fields — handled at the top-level form level
  if (isCoreField(label)) return null;

  // We only handle questions with at least one field
  const field = question.fields[0];
  if (!field) return null;

  const fieldName = field.name;

  // --- URL / social links ---
  if (label.includes("linkedin")) {
    return profile.linkedinUrl ? { [fieldName]: profile.linkedinUrl } : null;
  }

  if (label.includes("github")) {
    return profile.githubUrl ? { [fieldName]: profile.githubUrl } : null;
  }

  if (label.includes("website") || label.includes("portfolio")) {
    return profile.portfolioUrl ? { [fieldName]: profile.portfolioUrl } : null;
  }

  // --- Sponsorship ---
  if (/sponsor|visa sponsorship/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, profile.requiresSponsorship);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- Work authorization ---
  if (/authorized to work|authorization to work/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, !!profile.workAuthorization);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- Current / previous employer ---
  if (
    /current.*employer|previous.*employer|current or previous employer/i.test(
      question.label
    )
  ) {
    return profile.currentCompany
      ? { [fieldName]: profile.currentCompany }
      : null;
  }

  // --- Current / previous title ---
  if (
    /current.*title|previous.*title|job title/i.test(question.label)
  ) {
    return profile.currentTitle ? { [fieldName]: profile.currentTitle } : null;
  }

  // --- Education ---
  if (/school|university/i.test(question.label)) {
    return profile.university ? { [fieldName]: profile.university } : null;
  }

  if (/degree/i.test(question.label)) {
    return profile.highestDegree
      ? { [fieldName]: profile.highestDegree }
      : null;
  }

  // --- Location / city+state ---
  if (
    /city.*state|city and state|address.*work|plan.*working/i.test(
      question.label
    )
  ) {
    return profile.location ? { [fieldName]: profile.location } : null;
  }

  // --- Country of residence (select) ---
  if (/country.*reside|currently based/i.test(question.label)) {
    if (field.type !== "multi_value_single_select" || !profile.location)
      return null;
    // Try to match location string against available option labels
    const locationLower = profile.location.toLowerCase();
    const match = field.values.find((v) =>
      locationLower.includes(v.label.toLowerCase())
    );
    if (match) return { [fieldName]: match.value };
    // Fall back to "Other" if present
    const other = field.values.find(
      (v) => v.label.toLowerCase() === "other"
    );
    return other ? { [fieldName]: other.value } : null;
  }

  // --- Remote preference ---
  if (/plan.*work remotely|intend.*remote/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, profile.openToRemote);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- WhatsApp / SMS opt-in → always No ---
  if (/whatsapp|sms opt/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, false);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- AI policy acknowledgment → always Yes ---
  if (/ai policy|ai partnership/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, true);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- Single-option acknowledgments (privacy notice, data review, etc.) ---
  if (
    /privacy notice|data.*review|have reviewed/i.test(question.label)
  ) {
    if (
      field.type === "multi_value_single_select" &&
      field.values.length === 1
    ) {
      return { [fieldName]: field.values[0].value };
    }
    return null;
  }

  // --- Previously employed by this company → No ---
  if (
    /previously.*employ|employed by.*before|been employed by/i.test(
      question.label
    )
  ) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, false);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- Interviewed before → No ---
  if (/interviewed.*before|interviewed at/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const val = resolveYesNo(field, false);
    return val !== null ? { [fieldName]: val } : null;
  }

  // --- Voluntary identification (EEOC) — fuzzy match stored label against available values ---
  const voluntaryPatterns: Array<{ pattern: RegExp; profileValue: string | null | undefined }> = [
    { pattern: /\bgender\b/i, profileValue: profile.voluntaryGender },
    { pattern: /\brace\b|\bethnicity\b/i, profileValue: profile.voluntaryRace },
    { pattern: /\bveteran\b/i, profileValue: profile.voluntaryVeteranStatus },
    { pattern: /\bdisability\b|\bdisabled\b/i, profileValue: profile.voluntaryDisability },
  ];

  for (const { pattern, profileValue } of voluntaryPatterns) {
    if (pattern.test(question.label) && profileValue && field.values.length > 0) {
      const matched = fuzzyMatchValue(profileValue, field.values);
      if (matched !== null) return { [fieldName]: matched };
    }
  }

  return null;
}

/**
 * Return the subset of questions that cannot be auto-answered from the profile
 * and are not core skipped fields.
 */
export function getUnansweredQuestions(
  questions: GreenhouseQuestion[],
  profile: UserProfile
): GreenhouseQuestion[] {
  return questions.filter((q) => {
    // Drop core fields entirely
    if (isCoreField(q.label.toLowerCase())) return false;
    // Drop questions we can auto-answer
    if (autoAnswerQuestion(q, profile) !== null) return false;
    return true;
  });
}
