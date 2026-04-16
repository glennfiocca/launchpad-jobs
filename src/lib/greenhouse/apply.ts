import type { UserProfile } from "@prisma/client";
import type { GreenhouseQuestionField } from "@/types";
import { resolveEeocFields } from "@/lib/greenhouse/eeoc";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export interface ApplyOptions {
  boardToken: string;
  jobId: string;
  profile: UserProfile;
  trackingEmail: string;
  resumeBuffer?: Buffer;
  resumeFileName?: string;
  coverLetter?: string;
  questionAnswers?: Record<string, string | number>;
}

export interface ApplyResult {
  success: boolean;
  applicationId?: string;
  error?: string;
}

// Auto-apply to a Greenhouse job using the user's profile
export async function applyToGreenhouseJob(
  options: ApplyOptions
): Promise<ApplyResult> {
  const { boardToken, jobId, profile, trackingEmail, resumeBuffer, resumeFileName, coverLetter, questionAnswers } = options;

  const url = `${GREENHOUSE_BASE_URL}/${boardToken}/jobs/${jobId}`;

  const formData = new FormData();

  // Core required fields
  formData.append("first_name", profile.firstName);
  formData.append("last_name", profile.lastName);
  // Use tracking email so recruiter replies route back through our inbound handler
  formData.append("email", trackingEmail);
  if (profile.phone) formData.append("phone", profile.phone);
  if (profile.location) formData.append("location", profile.location);

  // Resume
  if (resumeBuffer && resumeFileName) {
    const resumeBlob = new Blob([new Uint8Array(resumeBuffer)], { type: "application/pdf" });
    formData.append("resume", resumeBlob, resumeFileName);
  }

  // Cover letter
  if (coverLetter) {
    const coverBlob = new Blob([coverLetter], { type: "text/plain" });
    formData.append("cover_letter", coverBlob, "cover_letter.txt");
  }

  // EEOC voluntary identification fields
  const eeocFields = resolveEeocFields(profile);
  for (const [key, val] of Object.entries(eeocFields)) {
    formData.append(key, val);
  }

  // Append all question answers directly as flat form fields (question_XXXXXXXX keys)
  if (questionAnswers) {
    for (const [fieldName, value] of Object.entries(questionAnswers)) {
      formData.append(fieldName, String(value));
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `Greenhouse returned ${res.status}: ${errorText}`,
      };
    }

    const data = (await res.json()) as { id?: number; application?: { id: number } };
    const applicationId = String(data.id ?? data.application?.id ?? "");

    return { success: true, applicationId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit application",
    };
  }
}

// Map Greenhouse question types to our form field types
export function mapQuestionType(
  ghType: GreenhouseQuestionField["type"]
): "text" | "textarea" | "file" | "select" | "multiselect" {
  switch (ghType) {
    case "input_text":
      return "text";
    case "textarea":
      return "textarea";
    case "input_file":
      return "file";
    case "multi_value_single_select":
      return "select";
    case "multi_value_multi_select":
      return "multiselect";
    default:
      return "text";
  }
}
