import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse, JobWithCompany } from "@/types";

export const dynamic = "force-dynamic";

export interface SavedJobEntry {
  savedAt: Date;
  job: JobWithCompany;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  try {
    const [total, savedJobs] = await Promise.all([
      db.savedJob.count({ where: { userId: session.user.id } }),
      db.savedJob.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          job: {
            include: {
              company: true,
              _count: { select: { applications: true } },
            },
          },
        },
      }),
    ]);

    const data: SavedJobEntry[] = savedJobs.map((s) => ({
      savedAt: s.createdAt,
      job: s.job as JobWithCompany,
    }));

    return NextResponse.json<ApiResponse<SavedJobEntry[]>>({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch (error) {
    console.error("Failed to fetch saved jobs:", error);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to fetch saved jobs" },
      { status: 500 }
    );
  }
}
