import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markAsRead, deleteNotification } from "@/lib/notifications";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const patchSchema = z.object({
  read: z.literal(true),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const notification = await markAsRead(id, session.user.id);
  if (!notification) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: notification });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;
  const deleted = await deleteNotification(id, session.user.id);

  if (!deleted) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: { id } });
}
