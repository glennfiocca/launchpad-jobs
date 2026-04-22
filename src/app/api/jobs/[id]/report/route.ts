import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { findJobByRouteId } from "@/lib/job-lookup";
import type { ApiResponse } from "@/types";
import type { ReportCategory, ReportStatus } from "@prisma/client";

const createReportSchema = z.object({
  category: z.enum(["SPAM", "INACCURATE", "OFFENSIVE", "BROKEN_LINK", "OTHER"]),
  message: z.string().max(1000).optional(),
});

interface ReportStatusResult {
  reported: boolean;
  category?: ReportCategory;
  status?: ReportStatus;
}

export async function POST(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { category, message } = parsed.data;
  const userId = session.user.id;
  const jobId = job.id;

  try {
    await db.jobReport.create({
      data: { userId, jobId, category, message },
    });

    return NextResponse.json<ApiResponse<{ reported: boolean }>>(
      { success: true, data: { reported: true } },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Unique constraint violation = already reported
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "You have already reported this job" },
        { status: 409 }
      );
    }
    console.error("Failed to create report:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to submit report" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<ReportStatusResult>>({
      success: true,
      data: { reported: false },
    });
  }

  const { id: routeId } = await params;
  const job = await findJobByRouteId(routeId);

  if (!job) {
    return NextResponse.json<ApiResponse<ReportStatusResult>>({
      success: true,
      data: { reported: false },
    });
  }

  try {
    const report = await db.jobReport.findUnique({
      where: { userId_jobId: { userId: session.user.id, jobId: job.id } },
      select: { category: true, status: true },
    });

    if (!report) {
      return NextResponse.json<ApiResponse<ReportStatusResult>>({
        success: true,
        data: { reported: false },
      });
    }

    return NextResponse.json<ApiResponse<ReportStatusResult>>({
      success: true,
      data: {
        reported: true,
        category: report.category,
        status: report.status,
      },
    });
  } catch (error) {
    console.error("Failed to fetch report status:", error);
    return NextResponse.json<ApiResponse<ReportStatusResult>>({
      success: true,
      data: { reported: false },
    });
  }
}
