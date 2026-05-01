/**
 * One-click unsubscribe endpoint — RFC 8058 compliant.
 *
 * GET  → render a confirmation page (user clicked the footer link)
 * POST → silently apply the change (mailbox provider triggers this on user action)
 *
 * Token carries { userId, type, exp } and is verified via HMAC-SHA256.
 * type === "ALL" disables every email channel by setting emailFrequency = "NEVER".
 * Any other type maps to a per-type boolean toggle on NotificationPreference.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-jwt";
import { TYPE_EMAIL_PREF_FIELD } from "@/lib/notifications/types";
import type { BooleanPrefField } from "@/lib/notifications/types";
import type { NotificationType, Prisma } from "@prisma/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Resolve the NotificationPreference update payload for a given unsubscribe type.
// Returns null when the type carries no email-routing implication (e.g. APPLIED,
// which has TYPE_EMAIL_PREF_FIELD entry of null) — the unsubscribe still succeeds
// but the DB is a no-op so we don't pretend to flip a phantom toggle.
function resolveUpdate(
  type: string
): Prisma.NotificationPreferenceUpdateInput | null {
  if (type === "ALL") {
    return { emailFrequency: "NEVER" };
  }

  const field = TYPE_EMAIL_PREF_FIELD[type as NotificationType] as
    | BooleanPrefField
    | null
    | undefined;
  if (!field) return null;

  // Build the update by field name — Prisma accepts a partial update payload.
  return { [field]: false } as Prisma.NotificationPreferenceUpdateInput;
}

async function applyUnsubscribe(userId: string, type: string): Promise<void> {
  const update = resolveUpdate(type);
  if (!update) return; // unmapped type — accept the request, no DB write

  // Build the create payload — userId is always required, plus the relevant
  // toggle. Schema defaults handle every other field on the create branch.
  const createPayload: Prisma.NotificationPreferenceCreateInput =
    type === "ALL"
      ? { user: { connect: { id: userId } }, emailFrequency: "NEVER" }
      : ({
          user: { connect: { id: userId } },
          ...(update as Record<string, boolean>),
        } as Prisma.NotificationPreferenceCreateInput);

  // Upsert so users without a preferences row still get unsubscribed.
  await db.notificationPreference.upsert({
    where: { userId },
    update,
    create: createPayload,
  });
}

function htmlPage(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribe</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 48px 16px; color: #334155; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    h1 { margin: 0 0 12px 0; font-size: 22px; color: #0f172a; }
    p { margin: 0 0 16px 0; line-height: 1.6; }
    a.btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

function renderSuccess(type: string): string {
  const label =
    type === "ALL"
      ? "all Pipeline emails"
      : `${type.replace(/_/g, " ").toLowerCase()} emails`;
  return htmlPage(`
    <h1>You're unsubscribed</h1>
    <p>You've been unsubscribed from ${label}. You may still receive critical account notifications such as offers and security alerts.</p>
    <p><a class="btn" href="${APP_URL}/settings/notifications">Manage all preferences</a></p>
  `);
}

function renderInvalid(): string {
  return htmlPage(`
    <h1>This link has expired</h1>
    <p>This unsubscribe link is no longer valid. Please log in to manage your email preferences.</p>
    <p><a class="btn" href="${APP_URL}/settings/notifications">Manage preferences</a></p>
  `);
}

// Shared token extraction — supports both query string (?token=…) and form body
async function extractToken(req: NextRequest): Promise<string | null> {
  const fromQuery = req.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;

  // RFC 8058: providers POST `List-Unsubscribe=One-Click` as form-urlencoded;
  // the token still travels in the URL, but accept a body fallback for safety.
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      const t = form.get("token");
      if (typeof t === "string" && t.length > 0) return t;
    }
  } catch {
    // ignore — fall through to null
  }

  return null;
}

// POST: one-click — mailbox providers fire this without user interaction.
// Always return 200 with empty body on success per RFC 8058.
export async function POST(req: NextRequest): Promise<Response> {
  const token = await extractToken(req);
  if (!token) {
    return new NextResponse(null, { status: 400 });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    await applyUnsubscribe(verified.userId, verified.type);
  } catch (err) {
    console.error("[unsubscribe] failed to apply preference", err);
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}

// GET: human-facing confirmation page.
export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse(renderInvalid(), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return new NextResponse(renderInvalid(), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  try {
    await applyUnsubscribe(verified.userId, verified.type);
  } catch (err) {
    console.error("[unsubscribe] failed to apply preference", err);
    return new NextResponse(renderInvalid(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(renderSuccess(verified.type), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
