// POST /api/contact — public contact-form submissions from /contact.
//
// Auth-OPTIONAL: anyone (signed in or not) can reach this endpoint. The
// page itself is referenced in the published Terms of Service as one of
// two privacy-contact channels, so neither the page nor this endpoint may
// require authentication.
//
// Order of operations is intentional:
//   1. Same-origin gate (CSRF defense — only our pages may POST).
//   2. Body parse + Zod validate (strict, generic 400 on failure).
//   3. Honeypot check (defense-in-depth: 200 OK, no DB row, no email).
//   4. Per-IP rate limit: 3 submissions / hour.
//   5. Best-effort session lookup (won't fail the request).
//   6. Persist DB row FIRST — we never want to lose a message if Resend
//      is degraded; admins can sweep WHERE deliveredAt IS NULL.
//   7. Dispatch email; on success, mark deliveredAt. On failure, log
//      (id only — no PII) and still return 200.
//
// Logging: only id, category, ipAddress, userId — never name/email/message.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/api/same-origin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendContactFormToAdmin } from "@/lib/email";

const CONTACT_RATE_LIMIT = 3;
const CONTACT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const CONTACT_CATEGORIES = [
  "general",
  "privacy",
  "account",
  "bug",
  "other",
] as const;

const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    category: z.enum(CONTACT_CATEGORIES),
    pageUrl: z
      .string()
      .trim()
      .url()
      .max(500)
      .optional()
      .or(z.literal("")),
    message: z.string().trim().min(20).max(5000),
    // Honeypot — must be empty. Real users never type into this hidden field.
    website: z.string().max(0).optional(),
  })
  .strict();

function genericInvalid(): NextResponse {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return genericInvalid();
  }

  // Defense-in-depth honeypot check on the RAW body — even if a malformed
  // payload sneaks past Zod (shouldn't, given .max(0)), we still trap it.
  const rawWebsite =
    raw && typeof raw === "object" && "website" in raw
      ? (raw as { website: unknown }).website
      : undefined;
  if (typeof rawWebsite === "string" && rawWebsite.length > 0) {
    const ip = getClientIp(request);
    console.warn(`[contact] honeypot tripped ip=${ip}`);
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return genericInvalid();
  }

  const ipAddress = getClientIp(request);

  // Per-IP rate limit. Cheap to short-circuit here before DB / email work.
  const rate = await checkRateLimit(
    `contact:ip:${ipAddress}`,
    CONTACT_RATE_LIMIT,
    CONTACT_RATE_WINDOW_MS,
  );
  if (!rate.allowed) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  // Best-effort session lookup. If next-auth throws (e.g. malformed cookie)
  // we still want anonymous users to reach this form.
  let userId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) userId = session.user.id;
  } catch {
    userId = null;
  }

  const userAgent = request.headers.get("user-agent") ?? null;
  const pageUrl =
    parsed.data.pageUrl && parsed.data.pageUrl.length > 0
      ? parsed.data.pageUrl
      : null;
  const safeIp = ipAddress === "unknown" ? null : ipAddress;

  // DB-first: persist before sending. If email fails, the row still exists.
  let createdId: string;
  let createdAt: Date;
  try {
    const row = await db.contactMessage.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        category: parsed.data.category,
        pageUrl,
        message: parsed.data.message,
        ipAddress: safeIp,
        userAgent,
        userId,
      },
      select: { id: true, createdAt: true },
    });
    createdId = row.id;
    createdAt = row.createdAt;
  } catch (err) {
    console.error(
      `[contact] persist failed category=${parsed.data.category} ip=${safeIp ?? "unknown"} userId=${userId ?? "anon"}:`,
      err,
    );
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }

  // Dispatch email — best-effort. Persistence above already protects against loss.
  const sendResult = await sendContactFormToAdmin({
    name: parsed.data.name,
    email: parsed.data.email,
    category: parsed.data.category,
    pageUrl: pageUrl ?? undefined,
    message: parsed.data.message,
    ipAddress: safeIp ?? undefined,
    userId: userId ?? undefined,
    createdAt,
  });

  if (sendResult.ok) {
    try {
      await db.contactMessage.update({
        where: { id: createdId },
        data: { deliveredAt: new Date() },
      });
    } catch (err) {
      // Non-fatal — message was delivered, we just couldn't persist the timestamp.
      console.error(
        `[contact] deliveredAt update failed id=${createdId}:`,
        err,
      );
    }
  } else {
    // No PII — the row id and category are enough for triage.
    console.error(
      `[contact] delivery failed id=${createdId} category=${parsed.data.category}`,
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
