import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { findJobByRouteId } from "@/lib/job-lookup";
import type { ApiResponse } from "@/types";

interface SaveToggleResult {
  saved: boolean;
}

export async function POST(
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

  const userId = session.user.id;
  const jobId = job.id;

  try {
    const existing = await db.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });

    if (existing) {
      await db.savedJob.delete({ where: { userId_jobId: { userId, jobId } } });
      return NextResponse.json<ApiResponse<SaveToggleResult>>({
        success: true,
        data: { saved: false },
      });
    }

    await db.savedJob.create({ data: { userId, jobId } });
    return NextResponse.json<ApiResponse<SaveToggleResult>>({
      success: true,
      data: { saved: true },
    });
  } catch (error) {
    console.error("Save toggle failed:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to update saved state" },
      { status: 500 }
    );
  }
}
