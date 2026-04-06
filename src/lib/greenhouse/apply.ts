import type { UserProfile } from "@prisma/client";
import type { GreenhouseQuestion } from "@/types";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export interface ApplyOptions {
  boardToken: string;
  jobId: string;
  profile: UserProfile;
  resumeBuffer?: Buffer;
  resumeFileName?: string;
  coverLetter?: string;
  additionalAnswers?: Record<string, string>;
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
  const { boardToken, jobId, profile, resumeBuffer, resumeFileName, coverLetter, additionalAnswers } = options;

  const url = `${GREENHOUSE_BASE_URL}/${boardToken}/jobs/${jobId}`;

  const formData = new FormData();

  // Core required fields
  formData.append("first_name", profile.firstName);
  formData.append("last_name", profile.lastName);
  formData.append("email", profile.email);
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

  // LinkedIn URL (common Greenhouse question)
  if (profile.linkedinUrl) {
    formData.append("job_application[answers_attributes][0][question_id]", "linkedin");
    formData.append("job_application[answers_attributes][0][answer]", profile.linkedinUrl);
  }

  // Any additional answers from custom questions
  if (additionalAnswers) {
    let idx = 1;
    for (const [questionId, answer] of Object.entries(additionalAnswers)) {
      formData.append(
        `job_application[answers_attributes][${idx}][question_id]`,
        questionId
      );
      formData.append(
        `job_application[answers_attributes][${idx}][answer]`,
        answer
      );
      idx++;
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
  ghType: GreenhouseQuestion["type"]
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
