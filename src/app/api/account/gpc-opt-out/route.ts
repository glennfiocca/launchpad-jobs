// POST /api/account/gpc-opt-out — flip a one-way `gpcOptOut: true` on the
// authenticated user when the browser sends the GPC signal.
//
// Order of operations:
//   1. Same-origin gate (CSRF defense — only our pages may POST).
//   2. Verify the request itself carries `Sec-GPC: 1`. The flag is intentionally
//      non-revocable in v1, so we refuse to set it without the actual signal.
//   3. Auth: require a session.
//   4. Idempotent — if already true, return 200 alreadySet:true without writing.
//   5. Otherwise update the row and return 200 alreadySet:false.
//
// Logging: only userId, never PII (email, name, etc.).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/api/same-origin";
import { GPC_HEADER } from "@/lib/gpc/detect";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Spec compliance: only the literal string "1" counts as a GPC signal.
  if (request.headers.get(GPC_HEADER) !== "1") {
    return NextResponse.json(
      { error: "GPC signal not present" },
      { status: 400 },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const existing = await db.user.findUnique({
      where: { id: userId },
      select: { gpcOptOut: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (existing.gpcOptOut) {
      return NextResponse.json(
        { success: true, alreadySet: true },
        { status: 200 },
      );
    }

    await db.user.update({
      where: { id: userId },
      data: { gpcOptOut: true },
    });

    console.info(`[gpc] opt-out recorded userId=${userId}`);

    return NextResponse.json(
      { success: true, alreadySet: false },
      { status: 200 },
    );
  } catch (err) {
    console.error(`[gpc] opt-out failed userId=${userId}:`, err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
