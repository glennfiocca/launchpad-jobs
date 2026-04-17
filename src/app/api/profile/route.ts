import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { ApiResponse } from "@/types";
import type { UserProfile } from "@prisma/client";

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
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
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
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
  voluntaryGender: z.string().optional(),
  voluntaryRace: z.string().optional(),
  voluntaryVeteranStatus: z.string().optional(),
  voluntaryDisability: z.string().optional(),
});

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

  return NextResponse.json<ApiResponse<UserProfile | null>>({
    success: true,
    data: profile,
  });
}

const voluntarySchema = z.object({
  voluntaryGender: z.string().nullable().optional(),
  voluntaryRace: z.string().nullable().optional(),
  voluntaryVeteranStatus: z.string().nullable().optional(),
  voluntaryDisability: z.string().nullable().optional(),
});

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = voluntarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.message },
      { status: 400 }
    );
  }

  const existing = await db.userProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        error: "Please save your main profile first before adding voluntary information.",
      },
      { status: 404 }
    );
  }

  const profile = await db.userProfile.update({
    where: { userId: session.user.id },
    data: parsed.data,
  });

  return NextResponse.json<ApiResponse<UserProfile>>({ success: true, data: profile });
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

  const data = {
    ...parsed.data,
    isComplete: true,
    linkedinUrl: parsed.data.linkedinUrl || null,
    githubUrl: parsed.data.githubUrl || null,
    portfolioUrl: parsed.data.portfolioUrl || null,
  };

  try {
    const profile = await db.userProfile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { ...data, userId: session.user.id },
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
