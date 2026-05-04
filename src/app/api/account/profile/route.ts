import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN } from "@/lib/settings/constants";
import { isSameOrigin } from "@/lib/api/same-origin";

// Phase-1 endpoint: updates the authed user's display name and/or avatar URL.
// Email is intentionally not patchable here (Phase 3 reverify flow).

// Constrain `image` to URLs the avatar route actually produces — the public
// bucket on DO Spaces. Without this, an attacker could PATCH their profile
// `image` to an external tracking pixel or attacker-controlled URL.
//
// `uploadPublicBuffer` (src/lib/spaces.ts) returns
//   `https://${BUCKET}.${REGION}.digitaloceanspaces.com/${key}`
// so the host always ends with `.digitaloceanspaces.com`. The CDN suffix
// covers the case where DO serves through their CDN endpoint variant.
const SPACES_HOST_SUFFIXES = [
  ".digitaloceanspaces.com",
  ".cdn.digitaloceanspaces.com",
] as const;

const imageSchema = z
  .string()
  .url()
  .refine(
    (raw) => {
      try {
        const host = new URL(raw).hostname;
        return SPACES_HOST_SUFFIXES.some((s) => host.endsWith(s));
      } catch {
        return false;
      }
    },
    "Avatar must be uploaded via /api/account/avatar",
  );

const patchSchema = z
  .object({
    name: z.string().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX).optional(),
    image: z.union([imageSchema, z.null()]).optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.image !== undefined, {
    message: "At least one of `name` or `image` is required",
  });

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

  const data: { name?: string; image?: string | null } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.image !== undefined) data.image = parsed.data.image;

  try {
    await db.user.update({
      where: { id: session.user.id },
      data,
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
