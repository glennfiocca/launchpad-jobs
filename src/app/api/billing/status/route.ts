import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCreditStatus } from "@/lib/credits";
import type { ApiResponse, CreditStatus } from "@/types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const status = await getCreditStatus(session.user.id);
  return NextResponse.json<ApiResponse<CreditStatus>>({
    success: true,
    data: status,
  });
}
