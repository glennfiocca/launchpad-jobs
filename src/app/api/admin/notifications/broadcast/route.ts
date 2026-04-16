import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBroadcastNotifications } from "@/lib/notifications";
import { z } from "zod";
import { randomUUID } from "crypto";
import type { ApiResponse } from "@/types";

const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  // Only relative paths or https:// URLs allowed
  ctaUrl: z
    .string()
    .refine(
      (v) => v.startsWith("/") || v.startsWith("https://"),
      "Must be a relative path or https:// URL"
    )
    .optional(),
  ctaLabel: z.string().max(100).optional(),
  audience: z.enum(["ALL", "SUBSCRIBED", "FREE"]).default("ALL"),
  // broadcastId is server-generated — not accepted from client
});

const PAGE_SIZE = 500;

async function resolveAudience(audience: string): Promise<string[]> {
  const baseWhere =
    audience === "ALL"
      ? { role: "USER" as const }
      : audience === "SUBSCRIBED"
      ? { role: "USER" as const, subscriptionStatus: "ACTIVE" as const }
      : {
          role: "USER" as const,
          subscriptionStatus: { not: "ACTIVE" as const },
        };

  const ids: string[] = [];
  let cursor: string | undefined;

  // Paginate to avoid loading the entire user table into memory
  for (;;) {
    const batch = await db.user.findMany({
      where: baseWhere,
      select: { id: true },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    for (const u of batch) ids.push(u.id);

    if (batch.length < PAGE_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  return ids;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 403 }
    );
  }

  const body = broadcastSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const userIds = await resolveAudience(body.data.audience);
  if (userIds.length === 0) {
    return NextResponse.json<ApiResponse<{ sent: number }>>({
      success: true,
      data: { sent: 0 },
    });
  }

  // Server-generate broadcastId for idempotency — not trusted from client
  const broadcastId = randomUUID();

  const sent = await createBroadcastNotifications({
    userIds,
    title: body.data.title,
    body: body.data.body,
    ctaUrl: body.data.ctaUrl,
    ctaLabel: body.data.ctaLabel,
    broadcastId,
  });

  return NextResponse.json<ApiResponse<{ sent: number }>>({
    success: true,
    data: { sent },
  });
}
