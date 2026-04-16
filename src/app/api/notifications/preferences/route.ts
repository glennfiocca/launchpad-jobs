import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreatePreferences } from "@/lib/notifications";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const updateSchema = z.object({
  emailFrequency: z.enum(["INSTANT", "DAILY", "NEVER"]).optional(),
  emailOnOffer: z.boolean().optional(),
  emailOnInterview: z.boolean().optional(),
  emailOnStatusChange: z.boolean().optional(),
  emailOnEmailReceived: z.boolean().optional(),
  emailOnListingRemoved: z.boolean().optional(),
  emailOnTeamMessage: z.boolean().optional(),
  emailOnSystem: z.boolean().optional(),
  emailOnApplyFailed: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const prefs = await getOrCreatePreferences(session.user.id);
  return NextResponse.json({ success: true, data: prefs });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Ensure preference row exists before updating
  await getOrCreatePreferences(session.user.id);

  const prefs = await db.notificationPreference.update({
    where: { userId: session.user.id },
    data: body.data,
  });

  return NextResponse.json({ success: true, data: prefs });
}
