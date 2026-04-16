import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markAllAsRead } from "@/lib/notifications";
import type { ApiResponse } from "@/types";

export async function PATCH() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const count = await markAllAsRead(session.user.id);
  return NextResponse.json<ApiResponse<{ markedCount: number }>>({
    success: true,
    data: { markedCount: count },
  });
}
