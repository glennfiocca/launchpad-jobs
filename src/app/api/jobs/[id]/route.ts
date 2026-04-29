import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClient } from "@/lib/ats/registry";
import { initializeAtsProviders } from "@/lib/ats/init";
import { findJobByRouteId } from "@/lib/job-lookup";
import type { ApiResponse, JobWithCompany } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params;

  const job = await findJobByRouteId(routeId);

  if (!job) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  const internalId = job.id;

  // Fetch fresh questions from ATS provider if needed
  let applicationQuestions = job.applicationQuestions;
  if (!applicationQuestions) {
    try {
      initializeAtsProviders();
      const provider = job.provider ?? "GREENHOUSE";
      const client = getClient(provider, job.boardToken);
      const questions = await client.getJobQuestions(job.externalId);
      applicationQuestions = (questions.length > 0 ? questions : null) as typeof job.applicationQuestions;
      // Cache the questions
      await db.job.update({
        where: { id: internalId },
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
