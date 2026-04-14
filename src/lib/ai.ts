import Anthropic from "@anthropic-ai/sdk";
import type { ApplicationStatus } from "@prisma/client";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY not set — AI features disabled");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export interface EmailClassificationResult {
  status: ApplicationStatus;
  confidence: number; // 0–1
  reasoning: string;
}

// Classify an email to determine the application status it implies
export async function classifyRecruitingEmail(
  emailSubject: string,
  emailBody: string,
  currentStatus: ApplicationStatus
): Promise<EmailClassificationResult> {
  const prompt = `You are an expert at analyzing job application emails and determining what stage of the hiring process they represent.

Current application status: ${currentStatus}

Email subject: ${emailSubject}

Email body:
${emailBody.slice(0, 3000)}

Based on this email, classify the application status. Choose the MOST APPROPRIATE status:

- APPLIED: Application was just submitted or acknowledged
- REVIEWING: Recruiter/team is reviewing the application (e.g., "we're reviewing your application", "under review")
- PHONE_SCREEN: Phone or video screen is scheduled or was requested (e.g., "schedule a call", "video interview", "30-minute chat")
- INTERVIEWING: Technical interview, panel interview, or on-site scheduled/completed (e.g., "technical interview", "interview loop", "meet the team")
- OFFER: Job offer extended (e.g., "pleased to offer", "offer letter", "compensation package")
- REJECTED: Application was declined (e.g., "not moving forward", "decided to pursue other candidates", "not a fit")
- WITHDRAWN: Candidate withdrew (only if email explicitly says they withdrew)

If the email is ambiguous or just a generic automated reply, keep the current status: ${currentStatus}

Respond with ONLY valid JSON in this exact format:
{
  "status": "STATUS_VALUE",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this status was chosen"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      status: string;
      confidence: number;
      reasoning: string;
    };

    // Validate status
    const validStatuses: ApplicationStatus[] = [
      "APPLIED", "REVIEWING", "PHONE_SCREEN", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN",
    ];
    if (!validStatuses.includes(parsed.status as ApplicationStatus)) {
      return { status: currentStatus, confidence: 0, reasoning: "Invalid status in AI response" };
    }

    return {
      status: parsed.status as ApplicationStatus,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    console.error("AI classification failed:", err);
    return { status: currentStatus, confidence: 0, reasoning: "Classification failed" };
  }
}

// STATUS_PRIORITY: higher = more advanced in the process; terminal/inactive statuses are 0
const STATUS_PRIORITY: Record<ApplicationStatus, number> = {
  APPLIED: 1,
  REVIEWING: 2,
  PHONE_SCREEN: 3,
  INTERVIEWING: 4,
  OFFER: 5,
  REJECTED: 0,
  WITHDRAWN: 0,
  LISTING_REMOVED: 0,
};

// Only advance status if the AI is confident AND the new status is further in the process
// (or it's a rejection/withdrawal which are terminal)
export function shouldUpdateStatus(
  current: ApplicationStatus,
  proposed: ApplicationStatus,
  confidence: number
): boolean {
  if (confidence < 0.75) return false;
  if (proposed === current) return false;
  if (proposed === "REJECTED" || proposed === "WITHDRAWN") return true;
  return STATUS_PRIORITY[proposed] > STATUS_PRIORITY[current];
}
