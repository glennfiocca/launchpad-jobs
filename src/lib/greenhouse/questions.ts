import type { UserProfile } from "@prisma/client";
import type { GreenhouseQuestion, GreenhouseQuestionField } from "@/types";
import { matchDemographicOption } from "./demographic-matcher";

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
    // Match "First Name" but not "Preferred First Name"
    (l.includes("first name") && !l.includes("preferred")) ||
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
  if (/\bcountry\b|country of res|currently based/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;

    const usAliases = ["usa", "us", "united states", "united states of america"];
    // Derive country from structured formatted address (last comma segment)
    const lastSegment = (profile.locationFormatted ?? profile.location ?? "")
      .split(",")
      .at(-1)
      ?.trim() ?? "";
    // If locationState is set, we know it's a US address
    const isUS = !!profile.locationState || usAliases.includes(lastSegment.toLowerCase());
    const targetLabel = isUS ? "United States" : lastSegment;
    if (!targetLabel) return null;

    const match = field.values.find(
      (v) =>
        v.label.toLowerCase() === targetLabel.toLowerCase() ||
        (isUS && usAliases.includes(v.label.toLowerCase()))
    );
    if (match) return { [fieldName]: match.value };

    // Fall back to "Other" if present
    const other = field.values.find((v) => v.label.toLowerCase() === "other");
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

  // --- Preferred first name / nickname ---
  if (/preferred.*name|preferred.*first|nickname/i.test(question.label)) {
    if (field.type !== "input_text") return null;
    return profile.preferredFirstName
      ? { [fieldName]: profile.preferredFirstName }
      : null;
  }

  // --- EEOC: gender identity ---
  // We don't collect EEOC data — rely on decline-fallback when available.
  if (/\bgender\b/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const options = field.values.map((v) => ({ id: v.value, label: v.label }));
    const result = matchDemographicOption(options, null, "gender");
    if (result.optionId !== null) return { [fieldName]: result.optionId };
    return null;
  }

  // --- EEOC: race / ethnicity ---
  if (/\brace\b|\bethnicity\b/i.test(question.label)) {
    if (field.type !== "multi_value_single_select" && field.type !== "multi_value_multi_select") return null;
    const options = field.values.map((v) => ({ id: v.value, label: v.label }));
    const result = matchDemographicOption(options, null, "race");
    if (result.optionId === null) return null;
    return field.type === "multi_value_multi_select"
      ? { [fieldName]: String(result.optionId) }
      : { [fieldName]: result.optionId };
  }

  // --- EEOC: veteran status ---
  if (/\bveteran\b/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const options = field.values.map((v) => ({ id: v.value, label: v.label }));
    const result = matchDemographicOption(options, null, "veteran");
    if (result.optionId !== null) return { [fieldName]: result.optionId };
    return null;
  }

  // --- EEOC: disability ---
  if (/disabilit/i.test(question.label)) {
    if (field.type !== "multi_value_single_select") return null;
    const options = field.values.map((v) => ({ id: v.value, label: v.label }));
    const result = matchDemographicOption(options, null, "disability");
    if (result.optionId !== null) return { [fieldName]: result.optionId };
    return null;
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
