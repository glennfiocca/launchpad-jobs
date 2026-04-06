import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import type { ApiResponse, ApplicationWithJob } from "@/types";
import type { ApplicationStatus } from "@prisma/client";

const updateSchema = z.object({
  status: z.enum(["APPLIED", "REVIEWING", "PHONE_SCREEN", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"]).optional(),
  userNotes: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const application = await db.application.findUnique({
    where: { id, userId: session.user.id },
    include: {
      job: { include: { company: true } },
      emails: { orderBy: { receivedAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!application) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json<ApiResponse<ApplicationWithJob>>({
    success: true,
    data: application as ApplicationWithJob,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const current = await db.application.findUnique({ where: { id, userId: session.user.id } });
  if (!current) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Not found" }, { status: 404 });
  }

  const updated = await db.application.update({
    where: { id },
    data: {
      ...(parsed.data.status && { status: parsed.data.status as ApplicationStatus }),
      ...(parsed.data.userNotes !== undefined && { userNotes: parsed.data.userNotes }),
    },
  });

  // Log status change
  if (parsed.data.status && parsed.data.status !== current.status) {
    await db.applicationStatusHistory.create({
      data: {
        applicationId: id,
        fromStatus: current.status,
        toStatus: parsed.data.status as ApplicationStatus,
        triggeredBy: "user",
      },
    });
  }

  return NextResponse.json<ApiResponse<typeof updated>>({ success: true, data: updated });
}
