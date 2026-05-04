import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import { db } from "@/lib/db";
import { Resend } from "resend";
import { magicLinkEmail } from "@/lib/email-templates";
import { cookies } from "next/headers"
import {
  ensureReferralCode,
  normalizeEmail,
  resolveReferralCode,
  createPendingReferral,
} from "@/lib/referral"

// Re-validate User.tokenVersion at most once per minute. Bounds DB load while
// keeping post-email-change sign-out latency under a minute.
const TOKEN_VERSION_CHECK_INTERVAL_MS = 60 * 1000

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as NextAuthOptions["adapter"],
  providers: [
    EmailProvider({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@trypipeline.ai",
      sendVerificationRequest: async ({ identifier: email, url }) => {
        const resend = new Resend(process.env.RESEND_API_KEY ?? "");
        const { subject, html } = magicLinkEmail({ url });
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "noreply@trypipeline.ai",
          to: email,
          subject,
          html,
        });
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Block soft-deleted users from re-authenticating, regardless of provider.
      if (user?.id) {
        const dbUser = await db.user
          .findUnique({
            where: { id: user.id },
            select: { deletedAt: true },
          })
          .catch(() => null)
        if (dbUser?.deletedAt) {
          return false
        }
      }

      if (account?.provider === "email" && user.id && user.email) {
        // Generate referral code for new users (idempotent)
        await ensureReferralCode(user.id).catch(() => null)

        // Store normalized email for dupe detection
        const normalized = normalizeEmail(user.email)
        await db.user
          .update({
            where: { id: user.id },
            data: { normalizedEmail: normalized },
          })
          .catch(() => null) // Ignore unique constraint on existing normalized email

        // Process referral attribution from cookie
        try {
          const cookieStore = await cookies()
          const refCookie = cookieStore.get("ref_code")

          if (refCookie?.value) {
            const attribution = await resolveReferralCode(refCookie.value)
            if (attribution && attribution.referrerId !== user.id) {
              await createPendingReferral({
                referrerId: attribution.referrerId,
                refereeId: user.id,
                referralCode: attribution.referralCode,
                refereeEmail: user.email,
              })
            }
          }
        } catch {
          // Non-fatal: referral attribution failure must never block login
        }
      }
      return true
    },
    async jwt({ token, user }) {
      // First-call branch (sign-in): pull canonical fields from DB once.
      if (user) {
        token.id = user.id
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, email: true, tokenVersion: true },
        })
        const adminEmails = process.env.ADMIN_EMAILS
          ?.split(",")
          .map((e) => e.trim().toLowerCase()) ?? []
        if (
          dbUser?.email &&
          adminEmails.includes(dbUser.email.toLowerCase()) &&
          dbUser.role !== "ADMIN"
        ) {
          await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
          token.role = "ADMIN"
        } else {
          token.role = dbUser?.role ?? "USER"
        }
        token.tokenVersion = dbUser?.tokenVersion ?? 0
        token.lastTokenVersionCheck = Date.now()
        return token
      }

      // Subsequent calls: revalidate tokenVersion periodically. We don't hit
      // the DB on every request — instead, refresh once per minute to keep
      // sign-out latency tight after an email change without flooding the DB.
      const now = Date.now()
      const lastCheck = token.lastTokenVersionCheck ?? 0
      if (token.id && now - lastCheck >= TOKEN_VERSION_CHECK_INTERVAL_MS) {
        const fresh = await db.user
          .findUnique({
            where: { id: token.id as string },
            select: { tokenVersion: true },
          })
          .catch(() => null)
        if (!fresh || fresh.tokenVersion !== (token.tokenVersion ?? 0)) {
          // Mismatch (or user gone): return an empty token so NextAuth
          // treats the session as expired and signs the user out.
          return {}
        }
        token.lastTokenVersionCheck = now
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: string
    }
  }
}

declare module "next-auth/jwt" {
  // Fields below are populated on first-time sign-in. They become optional in
  // the type system because the jwt callback can return `{}` to signal token
  // invalidation (post-tokenVersion bump) — NextAuth then forces re-auth.
  interface JWT {
    id?: string
    role?: string
    tokenVersion?: number
    lastTokenVersionCheck?: number
  }
}
