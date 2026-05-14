import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ApiResponse, TodayStats } from "@/types";

// Display floor for the "Live · N applications today" eyebrow chip on the
// editorial homepage. Holds the visual until real 24h volume crosses it.
const BASELINE = 1284;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const applicationsToday = await db.application.count({
    where: { appliedAt: { gte: since } },
  });

  const displayCount = Math.max(BASELINE, applicationsToday);

  return NextResponse.json<ApiResponse<TodayStats>>({
    success: true,
    data: { applicationsToday, baseline: BASELINE, displayCount },
  });
}
