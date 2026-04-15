import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGreenhouseClient } from "@/lib/greenhouse";
import { findJobByRouteId } from "@/lib/job-lookup";
import { Prisma } from "@prisma/client";
import type { ApiResponse, GreenhouseQuestion } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id: routeId } = await params;

  const job = await findJobByRouteId(routeId);
  if (!job) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Job not found" },
      { status: 404 }
    );
  }

  const internalId = job.id;

  // Return cached questions if available
  if (job.applicationQuestions) {
    return NextResponse.json<ApiResponse<GreenhouseQuestion[]>>({
      success: true,
      data: job.applicationQuestions as unknown as GreenhouseQuestion[],
    });
  }

  // Fetch from Greenhouse and cache
  try {
    const client = createGreenhouseClient(job.boardToken);
    const ghJob = await client.getJob(job.externalId);
    const questions: GreenhouseQuestion[] = ghJob.questions ?? [];

    await db.job.update({
      where: { id: internalId },
      data: { applicationQuestions: questions as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json<ApiResponse<GreenhouseQuestion[]>>({
      success: true,
      data: questions,
    });
  } catch (error) {
    // Return empty array on fetch failure — non-fatal
    console.error("Failed to fetch Greenhouse questions:", error);
    return NextResponse.json<ApiResponse<GreenhouseQuestion[]>>({
      success: true,
      data: [],
    });
  }
}
