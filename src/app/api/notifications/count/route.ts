import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import type { ApiResponse } from "@/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const count = await getUnreadCount(session.user.id);

  return NextResponse.json<ApiResponse<{ count: number }>>(
    { success: true, data: { count } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
