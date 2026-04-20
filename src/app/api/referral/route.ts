import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getReferralDashboard } from "@/lib/referral"
import type { ApiResponse } from "@/types"
import type { ReferralDashboardData } from "@/lib/referral"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const data = await getReferralDashboard(session.user.id)

  if (!data) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Referral code not yet generated" },
      { status: 404 }
    )
  }

  return NextResponse.json<ApiResponse<ReferralDashboardData>>({
    success: true,
    data,
  })
}
