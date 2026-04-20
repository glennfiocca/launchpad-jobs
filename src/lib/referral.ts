import { db } from "@/lib/db"
import type { ReferralStatus } from "@prisma/client"

// ─── Config ──────────────────────────────────────────────────────────────────

const REFERRAL_CREDITS_AWARD = 10
const REFERRAL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1
const REFERRAL_CODE_LENGTH = 8
const REFERRAL_EXPIRY_DAYS = 90
const VELOCITY_CAP = 20 // max conversions per referrer per 30 days
const VELOCITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

// Known disposable email domains
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "guerrillamail.com", "mailinator.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "dispostable.com", "mailnesia.com", "trashmail.com", "tempr.email",
  "fakeinbox.com", "mailcatch.com", "tempail.com", "burnermail.io",
  "maildrop.cc", "harakirimail.com", "getairmail.com", "10minutemail.com",
  "minutemail.com", "temp-mail.org", "emailondeck.com", "getnada.com",
  "mohmal.com", "discard.email", "mailsac.com", "inboxkitten.com",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.de",
  "guerrillamail.biz", "spam4.me", "trash-mail.com", "byom.de",
  "mytemp.email", "spamgourmet.com", "jetable.org", "mailexpire.com",
  "tempinbox.com", "filzmail.com", "devnullmail.com", "spamfree24.org",
  "objectmail.com", "proxymail.eu", "rcpt.at", "rmqkr.net",
  "trashmail.me", "wegwerfmail.de", "einrot.com",
])

// ─── Utilities ───────────────────────────────────────────────────────────────

export function generateReferralCode(): string {
  let code = ""
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)]
  }
  return code
}

export function normalizeEmail(email: string): string {
  const [localRaw, domain] = email.toLowerCase().trim().split("@")
  if (!localRaw || !domain) return email.toLowerCase().trim()

  let local = localRaw

  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "").replace(/\+.*$/, "")
  } else {
    local = local.replace(/\+.*$/, "")
  }

  return `${local}@${domain}`
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.toLowerCase().trim().split("@")[1]
  if (!domain) return false
  return DISPOSABLE_DOMAINS.has(domain)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReferralAttribution {
  referrerId: string
  referralCode: string
}

export interface ReferralDashboardData {
  referralCode: string
  referralLink: string
  referralCredits: number
  totalReferred: number
  totalConverted: number
  totalCreditsEarned: number
  referrals: Array<{
    id: string
    status: ReferralStatus
    createdAt: Date
    convertedAt: Date | null
  }>
}

// ─── Core Functions ──────────────────────────────────────────────────────────

export async function resolveReferralCode(
  code: string
): Promise<ReferralAttribution | null> {
  const user = await db.user.findUnique({
    where: { referralCode: code.toUpperCase() },
    select: { id: true, referralCode: true },
  })
  if (!user?.referralCode) return null
  return { referrerId: user.id, referralCode: user.referralCode }
}

export async function createPendingReferral(params: {
  referrerId: string
  refereeId: string
  referralCode: string
  refereeEmail: string
  refereeIpAddress?: string
}): Promise<string | null> {
  const { referrerId, refereeId, referralCode, refereeEmail, refereeIpAddress } = params

  // Self-referral guard
  if (referrerId === refereeId) return null

  // Disposable email guard
  if (isDisposableEmail(refereeEmail)) return null

  // Idempotency: only one referral row per referee
  const existing = await db.referral.findUnique({ where: { refereeId } })
  if (existing) return null

  const referrer = await db.user.findUnique({
    where: { id: referrerId },
    select: { signupIpAddress: true },
  })

  const ipFlagged = !!(
    refereeIpAddress &&
    referrer?.signupIpAddress &&
    refereeIpAddress === referrer.signupIpAddress
  )

  const expiresAt = new Date(Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const referral = await db.referral.create({
    data: {
      referrerId,
      refereeId,
      referralCode,
      status: ipFlagged ? "FLAGGED" : "PENDING",
      refereeIpAddress: refereeIpAddress ?? null,
      referrerIpAddress: referrer?.signupIpAddress ?? null,
      ipFlagged,
      expiresAt,
    },
  })

  return referral.id
}

export async function handleFirstApplicationConversion(
  refereeId: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({ where: { refereeId } })

    if (!referral) return false
    if (referral.status !== "PENDING") return false

    // Expiry check
    if (new Date() > referral.expiresAt) {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: "EXPIRED" },
      })
      return false
    }

    // Velocity cap
    const windowStart = new Date(Date.now() - VELOCITY_WINDOW_MS)
    const recentConversions = await tx.referral.count({
      where: {
        referrerId: referral.referrerId,
        status: "CONVERTED",
        firstApplicationAt: { gte: windowStart },
      },
    })

    if (recentConversions >= VELOCITY_CAP) {
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: "FLAGGED" },
      })
      return false
    }

    // Award credits atomically
    const referrer = await tx.user.findUniqueOrThrow({
      where: { id: referral.referrerId },
      select: { referralCredits: true },
    })

    const newBalance = referrer.referralCredits + REFERRAL_CREDITS_AWARD

    await tx.user.update({
      where: { id: referral.referrerId },
      data: { referralCredits: newBalance },
    })

    const creditTx = await tx.creditTransaction.create({
      data: {
        userId: referral.referrerId,
        type: "REFERRAL_BONUS",
        amount: REFERRAL_CREDITS_AWARD,
        referralId: referral.id,
        balanceAfter: newBalance,
        note: `Referral converted — referee submitted first application`,
      },
    })

    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: "CONVERTED",
        firstApplicationAt: new Date(),
        creditTransactionId: creditTx.id,
      },
    })

    return true
  })
}

export async function isFirstApplication(userId: string): Promise<boolean> {
  const count = await db.application.count({ where: { userId } })
  // Count is 1 means this is the first (already created before this is called)
  return count === 1
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  })
  if (user?.referralCode) return user.referralCode

  // Generate unique code with retry on collision
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode()
    try {
      await db.user.update({
        where: { id: userId },
        data: { referralCode: code },
      })
      return code
    } catch {
      // Unique constraint violation — retry
    }
  }

  throw new Error("Failed to generate unique referral code after 5 attempts")
}

export async function getReferralDashboard(
  userId: string
): Promise<ReferralDashboardData | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { referralCode: true, referralCredits: true },
  })
  if (!user?.referralCode) return null

  const referrals = await db.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      firstApplicationAt: true,
    },
  })

  const totalConverted = referrals.filter((r) => r.status === "CONVERTED").length

  const totalCreditsResult = await db.creditTransaction.aggregate({
    where: { userId, type: "REFERRAL_BONUS" },
    _sum: { amount: true },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai"

  return {
    referralCode: user.referralCode,
    referralLink: `${baseUrl}/signup?ref=${user.referralCode}`,
    referralCredits: user.referralCredits,
    totalReferred: referrals.length,
    totalConverted,
    totalCreditsEarned: totalCreditsResult._sum.amount ?? 0,
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      convertedAt: r.firstApplicationAt,
    })),
  }
}
