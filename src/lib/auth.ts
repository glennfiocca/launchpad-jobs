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
      if (user) {
        token.id = user.id
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, email: true },
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
  interface JWT {
    id: string
    role: string
  }
}
