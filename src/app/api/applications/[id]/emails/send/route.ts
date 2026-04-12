import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Resend } from "resend";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";
import type { ApplicationEmail } from "@prisma/client";

interface SendEmailBody {
  to: string;
  subject: string;
  body: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await params;

  // Parse and validate request body
  let body: SendEmailBody;
  try {
    body = (await req.json()) as SendEmailBody;
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { to, subject, body: emailBody } = body;

  if (
    typeof to !== "string" || to.trim() === "" ||
    typeof subject !== "string" || subject.trim() === "" ||
    typeof emailBody !== "string" || emailBody.trim() === ""
  ) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Fields 'to', 'subject', and 'body' are required and must be non-empty strings" },
      { status: 400 }
    );
  }

  // Ensure application belongs to this user
  const application = await db.application.findUnique({
    where: { id, userId: session.user.id },
  });

  if (!application) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  const fromAddress =
    application.trackingEmail ?? process.env.RESEND_FROM_EMAIL ?? "noreply@launchpad.jobs";

  // Send via Resend — instantiated here per spec (getResend is not exported)
  const resend = new Resend(process.env.RESEND_API_KEY ?? "");

  let resendId: string | null = null;
  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to,
      replyTo: fromAddress,
      cc: session.user.email ?? undefined,
      subject,
      html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${emailBody}</div>`,
      text: emailBody,
    });
    resendId = result.data?.id ?? null;
  } catch (err) {
    console.error("Resend send failed:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Failed to send email via Resend" },
      { status: 502 }
    );
  }

  // Persist outbound record only after successful send
  const emailRecord = await db.applicationEmail.create({
    data: {
      applicationId: id,
      messageId: resendId,
      from: fromAddress,
      to,
      subject,
      body: emailBody,
      htmlBody: null,
      direction: "outbound",
      receivedAt: new Date(),
    },
  });

  return NextResponse.json<ApiResponse<ApplicationEmail>>({
    success: true,
    data: emailRecord,
  });
}
