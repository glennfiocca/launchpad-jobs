import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("resume") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 8MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await db.userProfile.upsert({
    where: { userId: session.user.id },
    update: {
      resumeData: buffer,
      resumeFileName: file.name,
      resumeMimeType: file.type,
      resumeUrl: null, // clear any old URL-based resume
    },
    create: {
      userId: session.user.id,
      firstName: "",
      lastName: "",
      email: session.user.email ?? "",
      resumeData: buffer,
      resumeFileName: file.name,
      resumeMimeType: file.type,
    },
  });

  return NextResponse.json({ success: true, fileName: file.name });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeData: true, resumeFileName: true, resumeMimeType: true, resumeUrl: true },
  });

  if (!profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Serve from DO Spaces URL if available (production path)
  if (profile.resumeUrl) {
    return NextResponse.redirect(profile.resumeUrl);
  }

  if (!profile.resumeData) {
    return new NextResponse("No resume uploaded", { status: 404 });
  }

  return new NextResponse(profile.resumeData, {
    headers: {
      "Content-Type": profile.resumeMimeType ?? "application/pdf",
      "Content-Disposition": `inline; filename="${profile.resumeFileName ?? "resume.pdf"}"`,
    },
  });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.userProfile.updateMany({
    where: { userId: session.user.id },
    data: { resumeData: null, resumeFileName: null, resumeMimeType: null, resumeUrl: null },
  });

  return NextResponse.json({ success: true });
}
