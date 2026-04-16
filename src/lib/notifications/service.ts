import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { sendInstantNotificationEmail } from "@/lib/email";
import { getOrCreatePreferences } from "./preferences";
import { maybeSendDigest } from "./digest";
import {
  TYPE_PRIORITY,
  TYPE_EMAIL_PREF_FIELD,
  type CreateNotificationInput,
  type NotificationListOptions,
  type BooleanPrefField,
} from "./types";
import type {
  Notification,
  NotificationPreference,
  NotificationPriority,
} from "@prisma/client";

// ─── Email routing ─────────────────────────────────────────────────────────────

function shouldEmailInstantly(
  priority: NotificationPriority,
  prefs: NotificationPreference,
  type: CreateNotificationInput["type"]
): boolean {
  // CRITICAL always emails (e.g. OFFER, billing failures)
  if (priority === "CRITICAL") return true;

  // If frequency is NEVER, suppress everything except CRITICAL (handled above)
  if (prefs.emailFrequency === "NEVER") return false;

  // Check per-type toggle using narrowly typed field name
  const prefField: BooleanPrefField | null = TYPE_EMAIL_PREF_FIELD[type];
  if (!prefField) return false;
  if (!prefs[prefField]) return false;

  // HIGH priority → instant if preference allows
  if (priority === "HIGH") return prefs.emailFrequency === "INSTANT";

  // NORMAL → instant only if freq=INSTANT
  return prefs.emailFrequency === "INSTANT";
}

// ─── Core create ──────────────────────────────────────────────────────────────

export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification | null> {
  const priority = input.priority ?? TYPE_PRIORITY[input.type];

  // Auto-generate dedupeKey from context if not provided
  const dedupeKey: string | null =
    input.dedupeKey ??
    (input.applicationId ? `${input.type}:${input.applicationId}` : null);

  const createData = {
    userId: input.userId,
    type: input.type,
    priority,
    title: input.title,
    body: input.body ?? null,
    ctaUrl: input.ctaUrl ?? null,
    ctaLabel: input.ctaLabel ?? null,
    data: input.data
      ? (input.data as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    applicationId: input.applicationId ?? null,
    jobId: input.jobId ?? null,
    dedupeKey,
  };

  try {
    let notification: Notification;
    let isNew = true;

    if (dedupeKey) {
      // Atomic upsert — no-op update if key already exists
      const existing = await db.notification.findUnique({
        where: { dedupeKey },
      });
      if (existing) {
        // Deduped — return existing, skip email
        return existing;
      }
      notification = await db.notification.create({ data: createData });
    } else {
      // No dedup key — always create a fresh row
      notification = await db.notification.create({ data: createData });
      isNew = true; // always true here, but explicit for clarity
    }

    if (!isNew || input.suppressEmail) return notification;

    // Email routing
    const prefs = await getOrCreatePreferences(input.userId);
    const instant =
      input.forceEmail || shouldEmailInstantly(priority, prefs, input.type);

    if (instant && !notification.emailSent) {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        await sendInstantNotificationEmail({
          to: user.email,
          userName: user.name ?? "there",
          title: notification.title,
          body: notification.body ?? undefined,
          ctaUrl: notification.ctaUrl ?? undefined,
          ctaLabel: notification.ctaLabel ?? "View Dashboard",
        }).catch((err: unknown) => {
          console.error("[notifications] instant email failed", err);
        });

        await db.notification.update({
          where: { id: notification.id },
          data: { emailSent: true, emailSentAt: new Date() },
        });
      }
    } else if (!instant) {
      // Queue for digest (fire-and-forget)
      maybeSendDigest(input.userId).catch(() => undefined);
    }

    return notification;
  } catch (err) {
    console.error("[notifications] createNotification failed", err);
    return null;
  }
}

// ─── Batch create (admin broadcast) ───────────────────────────────────────────

export async function createBroadcastNotifications(opts: {
  userIds: string[];
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  broadcastId: string;
}): Promise<number> {
  const CHUNK_SIZE = 1000;
  let total = 0;

  for (let i = 0; i < opts.userIds.length; i += CHUNK_SIZE) {
    const batch = opts.userIds.slice(i, i + CHUNK_SIZE);
    const result = await db.notification.createMany({
      data: batch.map((userId) => ({
        userId,
        type: "TEAM_MESSAGE" as const,
        priority: "NORMAL" as const,
        title: opts.title,
        body: opts.body ?? null,
        ctaUrl: opts.ctaUrl ?? null,
        ctaLabel: opts.ctaLabel ?? null,
        data: { type: "TEAM_MESSAGE", broadcastId: opts.broadcastId },
        dedupeKey: `broadcast:${opts.broadcastId}:${userId}`,
      })),
      skipDuplicates: true,
    });
    total += result.count;
  }

  return total;
}

// ─── Read operations ──────────────────────────────────────────────────────────

export async function getNotifications(
  userId: string,
  opts: NotificationListOptions = {}
): Promise<{ items: Notification[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 20, 50);

  const items = await db.notification.findMany({
    where: {
      userId,
      ...(opts.unreadOnly ? { isRead: false } : {}),
      ...(opts.cursor
        ? { createdAt: { lt: new Date(opts.cursor) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // fetch one extra to determine if there's a next page
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore
    ? page[page.length - 1].createdAt.toISOString()
    : null;

  return { items: page, nextCursor };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, isRead: false } });
}

// ─── Write operations ─────────────────────────────────────────────────────────

export async function markAsRead(
  id: string,
  userId: string
): Promise<Notification | null> {
  const result = await db.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) return null;
  return db.notification.findUnique({ where: { id } });
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function deleteNotification(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await db.notification.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
