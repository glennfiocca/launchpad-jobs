import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";
import type { ApplicationEmail } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Ensure application belongs to user
  const application = await db.application.findUnique({
    where: { id, userId: session.user.id },
  });

  if (!application) {
    return NextResponse.json<ApiResponse<never>>({ success: false, error: "Not found" }, { status: 404 });
  }

  const emails = await db.applicationEmail.findMany({
    where: { applicationId: id },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json<ApiResponse<ApplicationEmail[]>>({ success: true, data: emails });
}
