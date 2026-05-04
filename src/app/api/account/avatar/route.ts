import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { uploadPublicBuffer } from "@/lib/spaces";
import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TO_EXT,
  type AvatarMimeType,
} from "@/lib/settings/constants";
import { isSameOrigin } from "@/lib/api/same-origin";

function isAllowedMime(mime: string): mime is AvatarMimeType {
  return (AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

// Magic-byte sniff. Don't trust the client-supplied `file.type` — an
// attacker could upload HTML/SVG labeled `image/png` to a public-read
// bucket and get a stored-XSS primitive. We validate the first bytes
// against the actual format and use the *detected* MIME downstream.
function detectImageMime(
  buf: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reject early to prevent resource exhaustion from a multi-GB multipart
  // body before we even start buffering. The +1024 slack covers multipart
  // envelope overhead (boundaries, headers).
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > AVATAR_MAX_BYTES + 1024) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form" },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isAllowedMime(fileEntry.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPEG, or WEBP." },
      { status: 400 },
    );
  }
  if (fileEntry.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large. Max 2 MB." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const detectedMime = detectImageMime(buffer);
  if (detectedMime === null || detectedMime !== fileEntry.type) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPEG, or WEBP." },
      { status: 400 },
    );
  }

  const ext = AVATAR_MIME_TO_EXT[detectedMime];
  const key = `avatars/${session.user.id}/${randomUUID()}.${ext}`;

  const url = await uploadPublicBuffer(key, buffer, detectedMime);
  if (!url) {
    return NextResponse.json(
      { error: "Storage not configured or upload failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url }, { status: 200 });
}
