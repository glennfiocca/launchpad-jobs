import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getClient } from "@/lib/ats/registry";
import { initializeAtsProviders } from "@/lib/ats/init";
import { findJobByRouteId } from "@/lib/job-lookup";
import { Prisma } from "@prisma/client";
import type { ApiResponse } from "@/types";
import type { NormalizedQuestion } from "@/lib/ats/types";

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

  // Return cached questions if available (skip stale Greenhouse-format cache)
  if (job.applicationQuestions) {
    const cached = job.applicationQuestions as unknown as Record<string, unknown>[];
    const isNormalized = cached.length === 0 || ("id" in cached[0] && "fieldType" in cached[0]);
    if (isNormalized) {
      return NextResponse.json<ApiResponse<NormalizedQuestion[]>>({
        success: true,
        data: cached as unknown as NormalizedQuestion[],
      });
    }
    // Old GreenhouseQuestion format detected — clear cache and re-fetch below
  }

  // Fetch from ATS provider and cache
  try {
    initializeAtsProviders();
    const provider = job.provider ?? "GREENHOUSE";
    const client = getClient(provider, job.boardToken);
    const normalizedQuestions: readonly NormalizedQuestion[] = await client.getJobQuestions(job.externalId);

    await db.job.update({
      where: { id: internalId },
      data: { applicationQuestions: normalizedQuestions as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json<ApiResponse<NormalizedQuestion[]>>({
      success: true,
      data: [...normalizedQuestions],
    });
  } catch (error) {
    // Return empty array on fetch failure — non-fatal
    console.error("Failed to fetch application questions:", error);
    return NextResponse.json<ApiResponse<NormalizedQuestion[]>>({
      success: true,
      data: [],
    });
  }
}
