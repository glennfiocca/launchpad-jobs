// Phase 3 — GET /api/account/email-change-confirm?token=...
//
// Token-bearer endpoint (no session required — possession of the token IS
// the auth, since it was sent to the prospective owner of the new address).
//
// Atomically updates User.email, increments tokenVersion (invalidates all
// outstanding JWTs via the auth callback), marks the request consumed, and
// kills any DB-stored sessions. Best-effort Stripe customer email sync runs
// AFTER the local tx commits — failure logs but does not roll back.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/referral";
import {
  hashEmailChangeToken,
} from "@/lib/account/email-change-token";
import { getStripe } from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Common security headers for any response from this route. Token must NOT
// leak via Referer when the post-confirmation page makes outbound requests.
const SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function redirectTo(path: string): NextResponse {
  const url = new URL(path, APP_URL);
  const res = NextResponse.redirect(url, { status: 303 });
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return redirectTo("/auth/signin?reason=email_change_invalid");
  }

  const tokenHash = hashEmailChangeToken(token);

  // Initial lookup outside the tx — cheaper short-circuit on bad token.
  const requestRow = await db.emailChangeRequest.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      newEmail: true,
      expiresAt: true,
      consumedAt: true,
    },
  });

  if (
    !requestRow ||
    requestRow.consumedAt !== null ||
    requestRow.expiresAt <= new Date()
  ) {
    return redirectTo("/auth/signin?reason=email_change_invalid");
  }

  const newEmail = requestRow.newEmail;
  const newEmailNormalized = normalizeEmail(newEmail);

  let stripeCustomerId: string | null = null;

  try {
    stripeCustomerId = await db.$transaction(async (tx) => {
      // 1. Re-verify — defends against TOCTOU between the outer read and tx start.
      const fresh = await tx.emailChangeRequest.findUnique({
        where: { id: requestRow.id },
        select: {
          id: true,
          userId: true,
          newEmail: true,
          expiresAt: true,
          consumedAt: true,
        },
      });
      if (
        !fresh ||
        fresh.consumedAt !== null ||
        fresh.expiresAt <= new Date()
      ) {
        throw new EmailChangeError("invalid");
      }

      // 2. Re-check uniqueness — another user may have signed up with this
      // address during the 1h window. The DB unique index is the ultimate
      // guarantor (the update below would throw P2002), but checking first
      // keeps the error path clean.
      const taken = await tx.user.findFirst({
        where: {
          AND: [
            { id: { not: fresh.userId } },
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
        throw new EmailChangeError("taken");
      }

      // 3. Capture the OLD email before mutating — needed to clean up
      // pending magic-link verification tokens keyed by identifier.
      const before = await tx.user.findUnique({
        where: { id: fresh.userId },
        select: { email: true },
      });
      const oldEmail = before?.email ?? null;

      // 4. Atomically: update email, normalize, bump tokenVersion.
      const updated = await tx.user.update({
        where: { id: fresh.userId },
        data: {
          email: newEmail,
          normalizedEmail: newEmailNormalized,
          tokenVersion: { increment: 1 },
        },
        select: { stripeCustomerId: true },
      });

      // 5. Mark request consumed.
      await tx.emailChangeRequest.update({
        where: { id: fresh.id },
        data: { consumedAt: new Date() },
      });

      // 6. Defense-in-depth — drop DB sessions even though strategy is JWT.
      await tx.session.deleteMany({ where: { userId: fresh.userId } });

      // 7. Drop pending magic-link verification tokens for the OLD email
      // (NextAuth's PrismaAdapter keys these by `identifier = email`).
      if (oldEmail) {
        await tx.verificationToken.deleteMany({
          where: { identifier: oldEmail },
        });
      }

      return updated.stripeCustomerId;
    });
  } catch (err) {
    if (err instanceof EmailChangeError && err.kind === "invalid") {
      return redirectTo("/auth/signin?reason=email_change_invalid");
    }
    if (err instanceof EmailChangeError && err.kind === "taken") {
      return redirectTo("/auth/signin?reason=email_change_invalid");
    }
    // Redact the underlying error — Prisma P2002 conflicts can include the
    // offending field value (newEmail), which we don't want in logs.
    const message = err instanceof Error ? err.name : "unknown";
    console.error(
      `[email-change-confirm] tx failed user=${requestRow.userId}: ${message}`,
    );
    return redirectTo("/auth/signin?reason=email_change_invalid");
  }

  // Best-effort Stripe customer email sync. Outside the tx — if this fails,
  // local state is already correct; we just have a transient drift on Stripe.
  // Wrap getStripe() inside the try so a missing STRIPE_SECRET_KEY in dev
  // can't 500 a flow that has already migrated the user successfully.
  if (stripeCustomerId) {
    try {
      const stripe = getStripe();
      await stripe.customers.update(stripeCustomerId, { email: newEmail });
    } catch (err) {
      const message = err instanceof Error ? err.name : "unknown";
      console.error(
        `[email-change-confirm] Stripe email sync failed customer=${stripeCustomerId}: ${message}`,
      );
    }
  }

  // NextAuth signs the user out on next request because tokenVersion mismatches.
  // Land them on the signin page pre-filled with the new address.
  return redirectTo(
    `/auth/signin?email=${encodeURIComponent(newEmail)}&reason=email_changed`,
  );
}

class EmailChangeError extends Error {
  readonly kind: "invalid" | "taken";
  constructor(kind: "invalid" | "taken") {
    super(kind);
    this.kind = kind;
    this.name = "EmailChangeError";
  }
}
