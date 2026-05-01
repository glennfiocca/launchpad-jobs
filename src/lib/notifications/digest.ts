import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { sendNotificationDigest } from "@/lib/email";
import { getOrCreatePreferences } from "./preferences";

const DIGEST_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Sends a digest email if the user has unread notifications and
// has not received a digest within the cooldown window.
// Safe to call fire-and-forget — never throws.
export async function maybeSendDigest(userId: string): Promise<void> {
  try {
    const prefs = await getOrCreatePreferences(userId);

    if (prefs.emailFrequency === "NEVER") return;

    const cooldownCutoff = new Date(Date.now() - DIGEST_COOLDOWN_MS);

    // Atomic claim — only succeeds for one concurrent caller; others see count=0 and bail
    const claimed = await db.notificationPreference.updateMany({
      where: {
        userId,
        OR: [
          { lastDigestSentAt: null },
          { lastDigestSentAt: { lt: cooldownCutoff } },
        ],
      },
      data: { lastDigestSentAt: new Date() },
    });

    if (claimed.count === 0) return; // another worker already sent or cooldown not elapsed

    const since = prefs.lastDigestSentAt ?? new Date(0);

    // Find unread notifications created since the last digest
    const pending = await db.notification.findMany({
      where: {
        userId,
        isRead: false,
        emailSent: false,
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (pending.length === 0) return;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) return;

    await sendNotificationDigest({
      to: user.email,
      userId,
      userName: user.name ?? "there",
      unreadCount: pending.length,
      preview: pending.slice(0, 3).map((n) => ({
        title: n.title,
        body: n.body ?? undefined,
      })),
      dashboardUrl: `${APP_URL}/dashboard`,
    });

    // Mark digest notifications as emailed
    const notificationIds = pending.map((n) => n.id);
    await db.notification.updateMany({
      where: { id: { in: notificationIds } },
      data: { emailSent: true, emailSentAt: new Date() },
    });
  } catch (err) {
    // Never throw from digest — notification failure must not break callers
    console.error("[notifications] digest failed for user", userId, err);
    Sentry.captureException(err, { tags: { area: "notifications.digest" } });
  }
}
