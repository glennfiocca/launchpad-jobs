import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSpacesClient, SPACES_BUCKET } from "@/lib/spaces";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB

function getSpacesKey(userId: string, fileName: string): string {
  return `resumes/${userId}/${Date.now()}-${fileName}`;
}

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
  const spaces = getSpacesClient();

  if (spaces) {
    // Production: upload to DO Spaces, store URL
    const key = getSpacesKey(session.user.id, file.name);
    await spaces.send(
      new PutObjectCommand({
        Bucket: SPACES_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: "private",
      })
    );
    const resumeUrl = `https://${SPACES_BUCKET}.${process.env.DO_SPACES_REGION ?? "nyc3"}.digitaloceanspaces.com/${key}`;

    await db.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        resumeUrl,
        resumeFileName: file.name,
        resumeMimeType: file.type,
        resumeData: null,
      },
      create: {
        userId: session.user.id,
        firstName: "",
        lastName: "",
        email: session.user.email ?? "",
        resumeUrl,
        resumeFileName: file.name,
        resumeMimeType: file.type,
      },
    });
  } else {
    // Local dev fallback: store bytes in DB
    await db.userProfile.upsert({
      where: { userId: session.user.id },
      update: {
        resumeData: buffer,
        resumeFileName: file.name,
        resumeMimeType: file.type,
        resumeUrl: null,
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
  }

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

  // Serve from DO Spaces via presigned URL (private bucket)
  if (profile.resumeUrl) {
    const spaces = getSpacesClient();
    if (spaces) {
      const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
      const signedUrl = await getSignedUrl(
        spaces,
        new GetObjectCommand({
          Bucket: SPACES_BUCKET,
          Key: key,
          ResponseContentDisposition: `inline; filename="${profile.resumeFileName ?? "resume.pdf"}"`,
          ResponseContentType: profile.resumeMimeType ?? "application/pdf",
        }),
        { expiresIn: 900 } // 15 minutes
      );
      return NextResponse.redirect(signedUrl);
    }
  }

  if (!profile.resumeData) {
    return new NextResponse("No resume uploaded", { status: 404 });
  }

  return new NextResponse(new Uint8Array(profile.resumeData), {
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

  // Fetch profile first to retrieve resumeUrl for Spaces cleanup
  const profile = await db.userProfile.findUnique({
    where: { userId: session.user.id },
    select: { resumeUrl: true },
  });

  await db.userProfile.updateMany({
    where: { userId: session.user.id },
    data: { resumeData: null, resumeFileName: null, resumeMimeType: null, resumeUrl: null },
  });

  // Delete from DO Spaces if applicable (non-fatal)
  const spaces = getSpacesClient();
  if (spaces && profile?.resumeUrl) {
    const key = profile.resumeUrl.split(".digitaloceanspaces.com/")[1];
    if (key) {
      await spaces
        .send(
          new DeleteObjectCommand({
            Bucket: SPACES_BUCKET,
            Key: key,
          })
        )
        .catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
