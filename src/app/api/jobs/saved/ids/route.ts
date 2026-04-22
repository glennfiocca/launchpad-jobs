import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<string[]>>({
      success: true,
      data: [],
    });
  }

  try {
    const savedJobs = await db.savedJob.findMany({
      where: { userId: session.user.id },
      select: { jobId: true },
    });

    return NextResponse.json<ApiResponse<string[]>>({
      success: true,
      data: savedJobs.map((s) => s.jobId),
    });
  } catch (error) {
    console.error("Failed to fetch saved job IDs:", error);
    return NextResponse.json<ApiResponse<string[]>>({
      success: true,
      data: [],
    });
  }
}
