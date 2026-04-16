import { db } from "@/lib/db";
import type { NotificationPreference } from "@prisma/client";

export async function getOrCreatePreferences(
  userId: string
): Promise<NotificationPreference> {
  const existing = await db.notificationPreference.findUnique({
    where: { userId },
  });
  if (existing) return existing;

  return db.notificationPreference.create({
    data: {
      userId,
      // Defaults come from schema — no need to repeat them here
    },
  });
}
