import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const PROTECTED_PATHS = [
  "/dashboard",
  "/profile",
  "/billing",
  "/admin",
  "/api/admin",
  "/settings",
]

const REFERRAL_CODE_LENGTH = 8

// ─── Rate limit tiers ─────────────────────────────────────────────────────
// Requests per window. Keyed by IP for public, by user ID for authenticated.
const RATE_LIMITS = {
  // Auth: tight limit to prevent brute force on magic link
  auth:      { limit: 10,  windowMs: 60_000 },  // 10 req/min
  // Public read endpoints: generous but bounded
  public:    { limit: 60,  windowMs: 60_000 },  // 60 req/min
  // Authenticated user actions: moderate
  user:      { limit: 30,  windowMs: 60_000 },  // 30 req/min
  // Admin: higher ceiling for dashboard usage
  admin:     { limit: 120, windowMs: 60_000 },  // 120 req/min
} as const

function getRateLimitTier(path: string): keyof typeof RATE_LIMITS | null {
  // Skip rate limiting for webhooks (server-to-server)
  if (path.startsWith("/api/webhooks")) return null
  if (path === "/api/billing/webhook") return null
  // Skip for cron-triggered sync
  if (path === "/api/jobs/sync") return null

  if (path.startsWith("/api/auth")) return "auth"
  if (path.startsWith("/api/admin")) return "admin"

  // Public read-only endpoints
  if (path.startsWith("/api/jobs") && !path.includes("saved")) return "public"
  if (path.startsWith("/api/places")) return "public"
  if (path.startsWith("/api/universities")) return "public"
  if (path === "/api/health") return "public"

  // All other API routes are authenticated user actions
  if (path.startsWith("/api/")) return "user"

  return null
}

export async function middleware(req: NextRequest) {
  const response = NextResponse.next()
  const path = req.nextUrl.pathname

  // ─── Rate limiting (API routes only) ────────────────────────────────────────
  if (path.startsWith("/api/")) {
    const tier = getRateLimitTier(path)
    if (tier) {
      const { limit, windowMs } = RATE_LIMITS[tier]
      const ip = getClientIp(req)
      const key = `${tier}:${ip}`
      const result = checkRateLimit(key, limit, windowMs)

      if (!result.allowed) {
        return NextResponse.json(
          { success: false, error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
              "X-RateLimit-Limit": String(result.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
            },
          }
        )
      }

      // Attach rate limit headers to successful responses
      response.headers.set("X-RateLimit-Limit", String(result.limit))
      response.headers.set("X-RateLimit-Remaining", String(result.remaining))
      response.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)))
    }
  }

  // ─── Referral cookie capture ───────────────────────────────────────────────
  const refCode = req.nextUrl.searchParams.get("ref")
  if (refCode && refCode.length === REFERRAL_CODE_LENGTH) {
    const hasSession =
      req.cookies.has("next-auth.session-token") ||
      req.cookies.has("__Secure-next-auth.session-token")

    if (!hasSession) {
      response.cookies.set("ref_code", refCode.toUpperCase(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: "/",
      })
    }
  }

  // ─── Auth protection ───────────────────────────────────────────────────────
  const isProtected = PROTECTED_PATHS.some((p) => path.startsWith(p))

  if (isProtected) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

    if (!token) {
      const signInUrl = new URL("/auth/signin", req.url)
      signInUrl.searchParams.set("callbackUrl", req.url)
      return NextResponse.redirect(signInUrl)
    }

    if (
      (path.startsWith("/admin") || path.startsWith("/api/admin")) &&
      token.role !== "ADMIN"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    "/signup",
    "/auth/signin",
    "/dashboard/:path*",
    "/profile/:path*",
    "/billing/:path*",
    "/admin/:path*",
    "/settings/:path*",
    // API routes for rate limiting
    "/api/:path*",
  ],
}
