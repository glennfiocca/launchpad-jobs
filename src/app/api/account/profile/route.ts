import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/settings/constants";
import { isSameOrigin } from "@/lib/api/same-origin";

// Updates the authed user's display name. Email is intentionally not patchable
// here (Phase 3 reverify flow). Avatars are not a product feature — the User
// model still carries `image` for NextAuth compatibility but it isn't surfaced
// or writable through this endpoint.

const patchSchema = z
  .object({
    name: z.string().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
  })
  .strict();

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
    });
  } catch (err) {
    console.error("[account-profile] PATCH failed:", err);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
