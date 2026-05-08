import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { ApiResponse } from "@/types";
import type { UserProfile } from "@prisma/client";
import {
  COMPANY_SIZES,
  EMPLOYMENT_TYPES,
  EQUITY_IMPORTANCE_VALUES,
  SEARCH_STATUSES,
  SECURITY_CLEARANCES,
} from "@/types/_shared/profile-enums";
import {
  computeCompletionScore,
  computeIsComplete,
} from "@/lib/profile/completeness";

// URLs in DB are nullable; UI sends "" for cleared fields. Mirror the existing
// linkedinUrl/githubUrl/portfolioUrl pattern for every social link.
const urlField = z.string().url().optional().or(z.literal(""));

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  preferredFirstName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  location: z.string().optional(),
  // Structured address (Google Places)
  locationPlaceId: z.string().optional(),
  locationFormatted: z.string().optional(),
  locationStreet: z.string().optional(),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  locationPostalCode: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  // Social / professional links (10 new + 3 existing)
  linkedinUrl: urlField,
  githubUrl: urlField,
  portfolioUrl: urlField,
  twitterUrl: urlField,
  stackOverflowUrl: urlField,
  dribbbleUrl: urlField,
  behanceUrl: urlField,
  mediumUrl: urlField,
  devToUrl: urlField,
  googleScholarUrl: urlField,
  huggingFaceUrl: urlField,
  kaggleUrl: urlField,
  youtubeUrl: urlField,
  resumeUrl: z.string().optional(),
  resumeFileName: z.string().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  yearsExperience: z.number().int().min(0).max(50).optional(),
  desiredSalaryMin: z.number().int().min(0).optional(),
  desiredSalaryMax: z.number().int().min(0).optional(),
  openToRemote: z.boolean().default(true),
  openToHybrid: z.boolean().default(true),
  openToOnsite: z.boolean().default(false),
  highestDegree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  university: z.string().optional(),
  universityId: z.string().optional(),
  graduationYear: z.number().int().min(1950).max(2030).optional(),
  workAuthorization: z.string().optional(),
  requiresSponsorship: z.boolean().default(false),
  // Job-search preferences (Phase 1 expansion)
  noticePeriodWeeks: z.coerce.number().int().min(0).max(52).nullable().optional(),
  earliestStartDate: z.coerce.date().nullable().optional(),
  targetRoles: z.array(z.string().min(1).max(120)).max(50).default([]),
  targetIndustries: z.array(z.string().min(1).max(120)).max(50).default([]),
  companySizePreferences: z.array(z.enum(COMPANY_SIZES)).max(COMPANY_SIZES.length).default([]),
  relocationOpen: z.boolean().default(false),
  relocationCities: z.array(z.string().min(1).max(120)).max(50).default([]),
  currencyPreference: z.string().length(3).default("USD"),
  equityImportance: z.enum(EQUITY_IMPORTANCE_VALUES).nullable().optional(),
  desiredEmploymentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).max(EMPLOYMENT_TYPES.length).default([]),
  searchStatus: z.enum(SEARCH_STATUSES).default("open"),
  // Compliance — none of these are PII; standard ATS questions.
  hasDriversLicense: z.boolean().nullable().optional(),
  willingBackgroundCheck: z.boolean().nullable().optional(),
  willingDrugTest: z.boolean().nullable().optional(),
  securityClearance: z.enum(SECURITY_CLEARANCES).default("none"),
  eligibleCountries: z.array(z.string().length(2)).max(50).default([]),
  // Templates
  coverLetterIntro: z.string().max(4000).nullable().optional(),
  whyImLookingTemplate: z.string().max(4000).nullable().optional(),
});

// "" → null normalization for every URL field, so Postgres stores cleared
// inputs as NULL rather than empty strings.
function nullifyEmptyUrls<T extends Record<string, unknown>>(data: T): T {
  const urlKeys: ReadonlyArray<keyof T> = [
    "linkedinUrl",
    "githubUrl",
    "portfolioUrl",
    "twitterUrl",
    "stackOverflowUrl",
    "dribbbleUrl",
    "behanceUrl",
    "mediumUrl",
    "devToUrl",
    "googleScholarUrl",
    "huggingFaceUrl",
    "kaggleUrl",
    "youtubeUrl",
  ] as ReadonlyArray<keyof T>;
  const out = { ...data } as Record<string, unknown>;
  for (const k of urlKeys) {
    const key = k as string;
    if (out[key] === "") out[key] = null;
  }
  return out as T;
}

// GET response keeps the legacy { success, data } envelope (consumed by
// /components/jobs/apply-modal.tsx and the per-tab forms) and adds an extra
// top-level `completionScore` field. Existing callers ignore unknown keys.
interface ProfileGetResponse extends ApiResponse<UserProfile | null> {
  completionScore?: number;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return NextResponse.json<ProfileGetResponse>({
      success: true,
      data: null,
    });
  }

  // Two cheap COUNT(*) queries beat over-fetching child rows just to compute
  // a score; we only need the scalar counts here.
  const [workExperiences, skills] = await Promise.all([
    db.workExperience.count({ where: { profileId: profile.id } }),
    db.skill.count({ where: { profileId: profile.id } }),
  ]);

  const completionScore = computeCompletionScore(profile, {
    workExperiences,
    skills,
  });

  return NextResponse.json<ProfileGetResponse>({
    success: true,
    data: profile,
    completionScore,
  });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.message },
      { status: 400 }
    );
  }

  const data = nullifyEmptyUrls(parsed.data);

  try {
    // First upsert: write the validated data without isComplete. We compute
    // completeness from the persisted row + child counts in a follow-up
    // update so the boolean reflects current state, not just the request body.
    const upserted = await db.userProfile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { ...data, userId: session.user.id },
    });

    const workExperiences = await db.workExperience.count({
      where: { profileId: upserted.id },
    });

    const isComplete = computeIsComplete(upserted, { workExperiences });

    const profile =
      upserted.isComplete === isComplete
        ? upserted
        : await db.userProfile.update({
            where: { id: upserted.id },
            data: { isComplete },
          });

    return NextResponse.json<ApiResponse<UserProfile>>({
      success: true,
      data: profile,
    });
  } catch (err) {
    // P2003: FK constraint — universityId references a non-existent University row
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2003"
    ) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Invalid university selection" },
        { status: 400 }
      );
    }
    throw err;
  }
}
