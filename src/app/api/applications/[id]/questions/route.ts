import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { ApiResponse, PendingQuestion, QuestionMeta } from "@/types";

const schema = z.object({
  answers: z.record(z.string(), z.string()),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const app = await db.application.findUnique({
    where: { id, userId: session.user.id },
    select: { submissionStatus: true, applicationSnapshot: true },
  });

  if (!app) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Not found" }, { status: 404 });
  }

  if (app.submissionStatus !== "AWAITING_OPERATOR") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Application is not awaiting operator" },
      { status: 400 }
    );
  }

  const snapshot = app.applicationSnapshot as Record<string, unknown> | null;
  if (!snapshot) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "No snapshot available" },
      { status: 400 }
    );
  }

  // Match answers by label using pendingQuestions as the mapping table
  const existing = (snapshot.pendingQuestions as PendingQuestion[] | undefined) ?? [];

  // Build label → fieldName map from pending questions
  const labelToFieldName: Record<string, string> = {};
  for (const pq of existing) {
    if (pq.fieldName) labelToFieldName[pq.label] = pq.fieldName;
  }

  // Store fieldName-keyed answers in questionAnswers (extension reads by fieldName)
  const fieldNameAnswers: Record<string, string> = {};
  for (const [label, val] of Object.entries(parsed.data.answers)) {
    const fn = labelToFieldName[label];
    if (fn) {
      fieldNameAnswers[fn] = val;
    } else {
      console.warn(`[questions] unmatched answer label — no pendingQuestion with this label`, {
        applicationId: id,
        label,
      });
    }
  }
  const existingAnswers = (snapshot.questionAnswers as Record<string, string> | undefined) ?? {};
  const updatedAnswers = { ...existingAnswers, ...fieldNameAnswers };

  // Merge userAnswer into pendingQuestions entries (match by label)
  const updatedPendingQuestions = existing.map((q) => {
    const answer = parsed.data.answers[q.label];
    return answer !== undefined ? { ...q, userAnswer: answer } : q;
  });

  // Append questionMeta entries for newly answered pending questions
  const existingMeta = (snapshot.questionMeta as QuestionMeta[] | undefined) ?? [];
  const existingMetaFields = new Set(existingMeta.map((m) => m.fieldName));
  const newMetaEntries: QuestionMeta[] = existing
    .filter((pq) => pq.fieldName && fieldNameAnswers[pq.fieldName] && !existingMetaFields.has(pq.fieldName))
    .map((pq) => ({
      label: pq.label,
      fieldName: pq.fieldName,
      fieldType: pq.fieldType,
      ...(pq.selectValues ? { selectValues: pq.selectValues } : {}),
    }));

  const updatedSnapshot = {
    ...snapshot,
    questionAnswers: updatedAnswers,
    questionMeta: [...existingMeta, ...newMetaEntries],
    pendingQuestions: updatedPendingQuestions,
  };

  await db.application.update({
    where: { id },
    data: { applicationSnapshot: updatedSnapshot as object },
  });

  return NextResponse.json<ApiResponse<{ updated: number }>>({
    success: true,
    data: { updated: Object.keys(parsed.data.answers).length },
  });
}
