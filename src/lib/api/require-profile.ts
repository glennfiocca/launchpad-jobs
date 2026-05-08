import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Discriminated-union result so route handlers can early-return without
// throwing. Keeps control flow explicit and avoids try/catch boilerplate.
export type RequireProfileResult =
  | { ok: true; userId: string; profileId: string }
  | { ok: false; response: NextResponse };

// Resolves the authenticated user's profile id, creating an envelope-shaped
// 401/404 NextResponse on failure. The auth pattern (getServerSession +
// authOptions) mirrors the canonical handler in src/app/api/profile/route.ts.
export async function requireProfile(): Promise<RequireProfileResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Profile not found. Create your profile before adding sub-resources." },
        { status: 404 }
      ),
    };
  }

  return { ok: true, userId: session.user.id, profileId: profile.id };
}

// Subset of Prisma model keys that have a `profileId` foreign key. Locking
// this down keeps `requireOwnedRow` from being called on unrelated tables.
export type ProfileChildModel =
  | "skill"
  | "workExperience"
  | "educationEntry"
  | "project"
  | "certification"
  | "spokenLanguage";

// Generic row-level ownership check. Returns the row when it belongs to the
// caller's profile, or null otherwise. Routes should treat null as 404 (not
// 403) to avoid leaking which ids exist across tenants.
export async function requireOwnedRow(
  model: ProfileChildModel,
  rowId: string,
  profileId: string
): Promise<{ id: string; profileId: string } | null> {
  // Prisma's runtime client is dynamically indexable but the strict generated
  // types don't expose a uniform shape. Cast through `unknown` to avoid an
  // `any` while still hitting the right delegate.
  const delegate = (db as unknown as Record<
    ProfileChildModel,
    {
      findUnique: (args: {
        where: { id: string };
        select: { id: true; profileId: true };
      }) => Promise<{ id: string; profileId: string } | null>;
    }
  >)[model];

  const row = await delegate.findUnique({
    where: { id: rowId },
    select: { id: true, profileId: true },
  });

  if (!row || row.profileId !== profileId) return null;
  return row;
}
