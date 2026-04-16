import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNotifications, getUnreadCount } from "@/lib/notifications";
import { z } from "zod";
import type { ApiResponse } from "@/types";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid query params" },
      { status: 400 }
    );
  }

  const [result, unread] = await Promise.all([
    getNotifications(session.user.id, parsed.data),
    getUnreadCount(session.user.id),
  ]);

  return NextResponse.json({
    success: true,
    data: { ...result, unreadCount: unread },
  });
}
