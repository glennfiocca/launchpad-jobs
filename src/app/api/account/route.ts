import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/account-deletion";
import type { ApiResponse } from "@/types";

export async function DELETE(): Promise<NextResponse<ApiResponse<{ success: true }>>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<{ success: true }>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    await deleteUserAccount(session.user.id);
    return NextResponse.json<ApiResponse<{ success: true }>>({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    console.error("[account-deletion] DELETE /api/account failed:", error);
    return NextResponse.json<ApiResponse<{ success: true }>>(
      { success: false, error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
