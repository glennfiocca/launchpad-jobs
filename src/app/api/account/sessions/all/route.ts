// Phase 4 — POST /api/account/sessions/all
//
// "Sign out everywhere." Increments User.tokenVersion so all outstanding
// JWTs become stale within the jwt-callback re-check window (~60s), and
// deletes the database-side Session rows used by the PrismaAdapter.
//
// Same-origin gate prevents a malicious cross-site form post from
// invalidating the user's tokens. The current browser's session cookie is
// cleared by the client-side signOut() call after this returns 204.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/api/same-origin";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId } });
    });
  } catch (err) {
    console.error(`[sessions/all] failed user=${userId}:`, err);
    return NextResponse.json(
      { error: "Failed to sign out everywhere" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
