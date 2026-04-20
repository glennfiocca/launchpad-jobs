import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"

const PROTECTED_PATHS = [
  "/dashboard",
  "/profile",
  "/billing",
  "/admin",
  "/api/admin",
  "/settings",
]

const REFERRAL_CODE_LENGTH = 8

export async function middleware(req: NextRequest) {
  const response = NextResponse.next()

  // ─── Referral cookie capture ───────────────────────────────────────────────
  const refCode = req.nextUrl.searchParams.get("ref")
  if (refCode && refCode.length === REFERRAL_CODE_LENGTH) {
    // Only set if user is NOT already logged in
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
  const path = req.nextUrl.pathname
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
    "/api/admin/:path*",
    "/settings/:path*",
  ],
}
