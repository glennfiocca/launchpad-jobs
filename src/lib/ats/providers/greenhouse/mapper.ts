import type { NormalizedJob, NormalizedQuestion, NormalizedFieldType } from "../../types";
import type { GreenhouseJob, GreenhouseQuestion } from "./types";
import { classifyLocation } from "@/lib/location-classifier";
import { inferEmploymentTypeFromTitle } from "@/lib/employment-type";
import { inferExperienceLevelFromTitle } from "@/lib/experience-level";
import { inferWorkModeFromJob } from "@/lib/work-mode";

/** Returns true if the location string indicates a remote position. */
function isRemoteJob(location: string): boolean {
  return /remote/i.test(location);
}

/** Extracts the first department name, or null. */
function extractDepartment(
  departments: GreenhouseJob["departments"]
): string | null {
  if (!departments || departments.length === 0) return null;
  return departments[0].name;
}

/** Maps a Greenhouse field type string to a NormalizedFieldType. */
export function mapFieldType(ghType: string): NormalizedFieldType {
  const mapping: Record<string, NormalizedFieldType> = {
    input_text: "text",
    textarea: "textarea",
    input_file: "file",
    multi_value_single_select: "select",
    multi_value_multi_select: "multiselect",
  };
  return mapping[ghType] ?? "text";
}

/** Converts a raw Greenhouse job to the normalized shape. */
export function mapGreenhouseJobToNormalized(
  ghJob: GreenhouseJob,
  _boardToken: string
): NormalizedJob {
  const location = ghJob.location?.name ?? null;
  const remote = location ? isRemoteJob(location) : false;

  // Greenhouse exposes no structured country data — classifier runs on
  // free text only. Still wins ~99% accuracy on standard "City, ST" formats.
  const classification = classifyLocation({ location, remote });

  return {
    externalId: String(ghJob.id),
    title: ghJob.title,
    location,
    department: extractDepartment(ghJob.departments),
    // Greenhouse public API doesn't expose employment type as a structured
    // field — infer from title (intern/co-op → Internship, contract* →
    // Contract, etc., default Full-time). Mirrors the legacy sync at
    // src/lib/greenhouse/sync.ts.
    employmentType: inferEmploymentTypeFromTitle(ghJob.title),
    // Seniority isn't exposed either — infer from title. Always populated
    // (heuristic returns "mid" by default).
    experienceLevel: inferExperienceLevelFromTitle(ghJob.title),
    // Work-mode (remote/hybrid/onsite) — also not exposed by Greenhouse.
    // Inferred from title + location + content + the legacy remote flag.
    // Always populated (heuristic returns "onsite" by default).
    workMode: inferWorkModeFromJob({
      title: ghJob.title,
      location,
      content: ghJob.content ?? null,
      remote,
    }),
    remote,
    absoluteUrl: ghJob.absolute_url,
    applyUrl: ghJob.absolute_url, // Same for Greenhouse
    content: ghJob.content ?? null,
    postedAt: ghJob.updated_at ? new Date(ghJob.updated_at) : null,
    countryCode: classification.countryCode,
    locationCategory: classification.category,
    isUSEligible: classification.isUSEligible,
  };
}

/**
 * Converts a raw Greenhouse question to one or more normalized questions.
 * Each Greenhouse question can have multiple fields; we emit one
 * NormalizedQuestion per field.
 */
export function mapGreenhouseQuestionToNormalized(
  ghQuestion: GreenhouseQuestion
): NormalizedQuestion[] {
  return ghQuestion.fields.map((field) => {
    const fieldType = mapFieldType(field.type);
    const hasOptions =
      field.type === "multi_value_single_select" ||
      field.type === "multi_value_multi_select";

    return {
      id: field.name,
      label: ghQuestion.label,
      required: ghQuestion.required,
      description: ghQuestion.description,
      fieldType,
      ...(hasOptions
        ? {
            options: field.values.map((v) => ({
              value: String(v.value),
              label: v.label,
            })),
          }
        : {}),
    };
  });
}
