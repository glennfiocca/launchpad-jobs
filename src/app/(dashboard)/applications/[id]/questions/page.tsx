import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PendingQuestionsForm } from "@/components/dashboard/pending-questions-form";
import type { PendingQuestion } from "@/types";

export const dynamic = "force-dynamic";

export default async function PendingQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { id } = await params;

  const app = await db.application.findUnique({
    where: { id, userId: session.user.id },
    include: { job: { include: { company: true } } },
  });

  if (!app || app.submissionStatus !== "AWAITING_OPERATOR") redirect("/dashboard");

  const snapshot = app.applicationSnapshot as Record<string, unknown> | null;
  const pendingQuestions = (snapshot?.pendingQuestions as PendingQuestion[] | undefined) ?? [];

  if (pendingQuestions.length === 0) redirect("/dashboard");

  return (
    <PendingQuestionsForm
      applicationId={id}
      jobTitle={app.job.title}
      companyName={app.job.company.name}
      pendingQuestions={pendingQuestions}
    />
  );
}
