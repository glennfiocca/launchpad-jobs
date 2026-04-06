import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createGreenhouseClient } from "@/lib/greenhouse";
import type { ApiResponse, JobWithCompany } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await db.job.findUnique({
    where: { id },
    include: {
      company: true,
      _count: { select: { applications: true } },
    },
  });

  if (!job) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  // Fetch fresh questions from Greenhouse if needed
  let applicationQuestions = job.applicationQuestions;
  if (!applicationQuestions) {
    try {
      const client = createGreenhouseClient(job.boardToken);
      const ghJob = await client.getJob(job.externalId);
      applicationQuestions = (ghJob.questions ?? null) as typeof job.applicationQuestions;
      // Cache the questions
      await db.job.update({
        where: { id },
        data: { applicationQuestions: applicationQuestions ?? undefined },
      });
    } catch {
      // Non-fatal: proceed without questions
    }
  }

  return NextResponse.json<ApiResponse<JobWithCompany>>({
    success: true,
    data: { ...job, applicationQuestions } as JobWithCompany,
  });
}
