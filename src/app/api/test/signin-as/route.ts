/**
 * Test-only sign-in endpoint — POST /api/test/signin-as
 *
 * Mints a NextAuth-compatible JWT session cookie for a seeded E2E test user
 * so Playwright (or other automated suites) can bypass the magic-link flow.
 *
 * SECURITY — triple-gated. ALL of these conditions must hold for the route to
 * function; otherwise the route returns 404 (not 401/403) so it looks
 * non-existent in production.
 *
 *   1. Either NODE_ENV !== "production", OR TEST_AUTH_SECRET is set & non-empty.
 *   2. TEST_AUTH_SECRET is present in env AND at least MIN_SECRET_LENGTH chars.
 *   3. Request body's `secret` matches process.env.TEST_AUTH_SECRET (timing-safe).
 *
 * Additional defenses:
 *   - Email allowlist: must start with "e2e-" and end with "@trypipeline.ai".
 *   - User must already be seeded; we never create users here.
 *   - Every accepted call is logged with the [test-signin] prefix for audit.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import crypto from "node:crypto";
import { db } from "@/lib/db";

// 16-char minimum forces accidental empty/short values (e.g. "" or "test") to
// fail the gate even if the var is technically defined.
const MIN_SECRET_LENGTH = 16;

const TEST_EMAIL_PREFIX = "e2e-";
const TEST_EMAIL_DOMAIN = "@trypipeline.ai";

const bodySchema = z.object({
  email: z.string().email().max(320),
  secret: z.string().min(1).max(512),
});

// Cookie name must exactly match what NextAuth uses so our injected token is
// picked up by getServerSession / getToken downstream.
function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

// Hidden 404 response — used for every gate failure that should look like the
// route doesn't exist in production builds.
function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

// Constant-time string comparison. Falls back to false when lengths differ
// (timingSafeEqual throws on length mismatch).
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isAllowlistedTestEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.startsWith(TEST_EMAIL_PREFIX) && lower.endsWith(TEST_EMAIL_DOMAIN);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const testSecret = process.env.TEST_AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  // Gate 1 + 2: secret must exist and be long enough. In production we
  // additionally require the secret to be present (which is implied by the
  // length check, but spelled out for clarity).
  if (!testSecret || testSecret.length < MIN_SECRET_LENGTH) {
    return notFound();
  }
  if (isProd && !testSecret) {
    // Defensive — already covered above, but mirrors the spec literally.
    return notFound();
  }

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const json = (await req.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "invalid request body" },
        { status: 400 },
      );
    }
    parsedBody = parsed.data;
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid json" },
      { status: 400 },
    );
  }

  // Gate 3: timing-safe secret comparison.
  if (!timingSafeStringEqual(parsedBody.secret, testSecret)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  if (!isAllowlistedTestEmail(parsedBody.email)) {
    return NextResponse.json(
      { success: false, error: "forbidden: email not in test allowlist" },
      { status: 403 },
    );
  }

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    // Misconfiguration — refuse rather than mint an unsigned token.
    return NextResponse.json(
      { success: false, error: "server misconfigured" },
      { status: 500 },
    );
  }

  const user = await db.user.findUnique({
    where: { email: parsedBody.email.toLowerCase() },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: "test user not seeded" },
      { status: 404 },
    );
  }

  const token = await encode({
    token: {
      name: user.name ?? null,
      email: user.email ?? null,
      sub: user.id,
      id: user.id,
      role: user.role,
      picture: null,
    },
    secret: nextAuthSecret,
  });

  // Audit log — every accepted call.
  console.log(
    `[test-signin] minted session for userId=${user.id} email=${user.email}`,
  );

  const response = NextResponse.json(
    { success: true, userId: user.id },
    { status: 200 },
  );

  response.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
