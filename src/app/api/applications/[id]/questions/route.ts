import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { ApiResponse, PendingQuestion } from "@/types";

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

  // Merge userAnswer into pendingQuestions entries
  const existing = (snapshot.pendingQuestions as PendingQuestion[] | undefined) ?? [];
  const updatedPendingQuestions = existing.map((q) => {
    const answer = parsed.data.answers[q.fieldName];
    return answer !== undefined ? { ...q, userAnswer: answer } : q;
  });

  // Also merge into questionAnswers so the fill package picks them up
  const existingAnswers = (snapshot.questionAnswers as Record<string, string> | undefined) ?? {};
  const updatedAnswers = { ...existingAnswers, ...parsed.data.answers };

  const updatedSnapshot = {
    ...snapshot,
    questionAnswers: updatedAnswers,
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
