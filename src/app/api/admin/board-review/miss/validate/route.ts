import { NextRequest, NextResponse } from "next/server"
import { requireAdminSession, badRequest } from "../../../_helpers"
import { missValidateSchema } from "@/lib/validations/board-review"
import { probeBoard } from "@/lib/board-review/probe"
import type { ApiResponse } from "@/types"
import type { MissValidateResult } from "@/lib/board-review/types"

/**
 * POST /api/admin/board-review/miss/validate
 *
 * Live-probes the public ATS API for a candidate slug. Always responds 200
 * with `{ ok }` baked into the payload — the client renders a different UI
 * branch on failure (red banner vs. green confirm), so non-2xx would force
 * extra error handling for no benefit.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body: unknown = await req.json().catch(() => null)
  const parsed = missValidateSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.message)

  const result = await probeBoard(parsed.data.slug, parsed.data.ats)
  return NextResponse.json<ApiResponse<MissValidateResult>>({ success: true, data: result })
}
