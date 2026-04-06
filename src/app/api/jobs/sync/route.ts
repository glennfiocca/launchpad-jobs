import { NextResponse } from "next/server";
import { syncGreenhouseBoard, SEED_BOARDS } from "@/lib/greenhouse";
import type { ApiResponse } from "@/types";

// Protected by a secret token for cron jobs
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const results = [];
  const errors = [];

  for (const board of SEED_BOARDS) {
    try {
      const result = await syncGreenhouseBoard(board.token, board.name, board.logoUrl);
      results.push(result);
    } catch (err) {
      errors.push({
        board: board.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json<ApiResponse<typeof results>>({
    success: true,
    data: results,
    ...(errors.length > 0 && { error: `${errors.length} boards failed` }),
  });
}
