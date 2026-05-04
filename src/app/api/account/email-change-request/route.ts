// Phase 3 — POST /api/account/email-change-request
//
// Authed user requests an email change. We send a verification link to the
// PROSPECTIVE new address (token sent only there proves ownership), and a
// non-actionable notice to the CURRENT address so the rightful account
// holder learns about the change-in-progress regardless of whether they
// initiated it.
//
// The token is stored only as sha256(token) — see @/lib/account/email-change-token.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/api/same-origin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/referral";
import {
  generateEmailChangeToken,
  hashEmailChangeToken,
} from "@/lib/account/email-change-token";
import {
  sendEmailChangeNotice,
  sendEmailChangeVerify,
} from "@/lib/email";
import {
  EMAIL_CHANGE_RATE_PER_HOUR,
  EMAIL_CHANGE_RATE_PER_MINUTE,
  EMAIL_CHANGE_TOKEN_TTL_MS,
  EMAIL_CHANGE_WINDOW_HOUR_MS,
  EMAIL_CHANGE_WINDOW_MINUTE_MS,
} from "@/lib/settings/constants";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const bodySchema = z
  .object({
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Per-user rate limits — minute first (cheaper to short-circuit), then hour.
  const minute = await checkRateLimit(
    `email-change:user:${userId}:minute`,
    EMAIL_CHANGE_RATE_PER_MINUTE,
    EMAIL_CHANGE_WINDOW_MINUTE_MS,
  );
  if (!minute.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }
  const hour = await checkRateLimit(
    `email-change:user:${userId}:hour`,
    EMAIL_CHANGE_RATE_PER_HOUR,
    EMAIL_CHANGE_WINDOW_HOUR_MS,
  );
  if (!hour.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email" },
      { status: 400 },
    );
  }
  const newEmail = parsed.data.newEmail;
  const newEmailNormalized = normalizeEmail(newEmail);

  const me = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, normalizedEmail: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    me.email?.toLowerCase() === newEmail ||
    me.normalizedEmail === newEmailNormalized
  ) {
    return NextResponse.json(
      { error: "That's already your email." },
      { status: 400 },
    );
  }

  // Email-enumeration tradeoff: the user is authenticated and changing THEIR
  // own email, so disclosing "in use" is reasonable UX (and OWASP-permissible
  // for authenticated state changes). We check both raw + normalized because
  // signups normalize aggressively (gmail dots, plus-addresses).
  const taken = await db.user.findFirst({
    where: {
      AND: [
        { id: { not: userId } },
        {
          OR: [
            { email: newEmail },
            { normalizedEmail: newEmailNormalized },
          ],
        },
      ],
    },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { error: "That email is already in use." },
      { status: 409 },
    );
  }

  const token = generateEmailChangeToken();
  const tokenHash = hashEmailChangeToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS);
  const ipAddress = getClientIp(request);

  try {
    await db.emailChangeRequest.create({
      data: {
        userId,
        newEmail,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress === "unknown" ? null : ipAddress,
      },
    });
  } catch (err) {
    console.error(`[email-change-request] persist failed user=${userId}:`, err);
    return NextResponse.json(
      { error: "Failed to start email change" },
      { status: 500 },
    );
  }

  const confirmUrl = `${APP_URL}/api/account/email-change-confirm?token=${encodeURIComponent(token)}`;

  // Verification link to the NEW address — token only goes here.
  try {
    await sendEmailChangeVerify({ to: newEmail, confirmUrl });
  } catch (err) {
    console.error(`[email-change-request] verify send failed user=${userId}:`, err);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 },
    );
  }

  // Non-actionable notice to the CURRENT address. Best-effort: a failure here
  // doesn't block the flow — the verification still works. We log without PII.
  if (me.email) {
    try {
      await sendEmailChangeNotice({ to: me.email, newEmail });
    } catch (err) {
      console.error(`[email-change-request] notice send failed user=${userId}:`, err);
    }
  }

  return new NextResponse(null, { status: 204 });
}
