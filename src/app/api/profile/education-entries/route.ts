import { NextResponse } from "next/server";
import { buildCollectionRoute } from "@/lib/api/profile-child-route";
import { educationEntrySchema } from "@/lib/validation/profile-children";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/api/require-profile";
import { EDUCATION_ENTRY_INCLUDE } from "./_include";

// POST stays delegated to the shared builder — validate + create + auto-order.
// The shared `include` is forwarded so the created row carries its joined
// University (mirrors the GET shape).
const { POST } = buildCollectionRoute({
  model: "educationEntry",
  createSchema: educationEntrySchema,
  include: EDUCATION_ENTRY_INCLUDE,
});

// Fallbacks when a legacy profile recorded one scalar but not the others.
// The EducationEntry schema enforces min(1) on degree and fieldOfStudy, so we
// can't persist empty strings — surface a clear placeholder the user can edit.
const LEGACY_DEGREE_FALLBACK = "Degree";
const LEGACY_FIELD_FALLBACK = "Field of study";

// Selected slice of UserProfile carrying the legacy single-degree scalars that
// the Education tab used to edit directly. Kept narrow so unrelated columns
// don't drift through the migration path.
interface LegacyEducationSlice {
  university: string | null;
  universityId: string | null;
  highestDegree: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

function hasLegacyEducationData(p: LegacyEducationSlice): boolean {
  return Boolean(
    p.university ||
      p.universityId ||
      p.highestDegree ||
      p.fieldOfStudy ||
      p.graduationYear
  );
}

// One-shot forward migration: when a profile has no EducationEntry rows yet
// but did fill in the legacy scalar fields, synthesize a single entry from
// those values so the list-based UI shows the user's existing data. Idempotent
// — once any entry exists this block is skipped on subsequent GETs.
async function migrateLegacyEducationIfNeeded(profileId: string): Promise<void> {
  const profile = await db.userProfile.findUnique({
    where: { id: profileId },
    select: {
      university: true,
      universityId: true,
      highestDegree: true,
      fieldOfStudy: true,
      graduationYear: true,
    },
  });

  if (!profile || !hasLegacyEducationData(profile)) return;

  await db.educationEntry.create({
    data: {
      profileId,
      universityId: profile.universityId,
      // Only set free-text schoolName when there's no linked University row,
      // mirroring the educationEntrySchema XOR check.
      schoolName: profile.universityId ? null : profile.university,
      degree: profile.highestDegree ?? LEGACY_DEGREE_FALLBACK,
      fieldOfStudy: profile.fieldOfStudy ?? LEGACY_FIELD_FALLBACK,
      endYear: profile.graduationYear,
      order: 0,
    },
  });
}

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireProfile();
    if (!auth.ok) return auth.response;

    const initial = await db.educationEntry.findMany({
      where: { profileId: auth.profileId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: EDUCATION_ENTRY_INCLUDE,
    });

    if (initial.length > 0) {
      return NextResponse.json({ data: initial });
    }

    // No entries yet — attempt one-time migration from legacy scalars.
    // Failure to migrate must not break the GET; log and fall through to the
    // empty list so the user can add entries manually.
    try {
      await migrateLegacyEducationIfNeeded(auth.profileId);
    } catch (err) {
      console.error("Legacy education migration failed:", err);
      return NextResponse.json({ data: [] });
    }

    const rows = await db.educationEntry.findMany({
      where: { profileId: auth.profileId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: EDUCATION_ENTRY_INCLUDE,
    });
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("Education entries GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export { POST };
