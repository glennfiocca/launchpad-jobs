import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import type { Session } from "next-auth"

type AdminSessionResult =
  | { session: Session & { user: { id: string; role: string } }; error: null }
  | { session: null; error: NextResponse }

export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "ADMIN") {
    return {
      session: null,
      error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
    }
  }
  return { session: session as Session & { user: { id: string; role: string } }, error: null }
}

export function forbidden() {
  return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
}

export function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 })
}

export function notFound(message = "Not found") {
  return NextResponse.json({ success: false, error: message }, { status: 404 })
}
