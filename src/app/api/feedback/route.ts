import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const feedbackSchema = z.object({
  type: z.enum(["BUG", "FEATURE", "PRAISE", "OTHER"]),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().min(1).max(5000),
  pageUrl: z.string().max(2000),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userAgent = req.headers.get("user-agent") ?? undefined

  const feedback = await db.feedback.create({
    data: {
      type: parsed.data.type,
      rating: parsed.data.rating ?? null,
      message: parsed.data.message,
      pageUrl: parsed.data.pageUrl,
      userId: session?.user?.id ?? null,
      userEmail: session?.user?.email ?? null,
      userAgent: userAgent ?? null,
    },
  })

  return NextResponse.json({ success: true, data: { id: feedback.id } }, { status: 201 })
}
