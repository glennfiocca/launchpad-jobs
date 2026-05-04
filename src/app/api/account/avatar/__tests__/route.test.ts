import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/spaces", () => ({
  uploadPublicBuffer: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { uploadPublicBuffer } from "@/lib/spaces";
import { POST } from "../route";
import { AVATAR_MAX_BYTES } from "@/lib/settings/constants";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockUpload = uploadPublicBuffer as unknown as ReturnType<typeof vi.fn>;

// Same-origin headers used by the happy-path tests so the new CSRF check
// passes. The Request URL is `http://localhost/...` so `localhost` matches.
const SAME_ORIGIN_HEADERS: Record<string, string> = {
  origin: "http://localhost",
  host: "localhost",
};

// Magic-byte prefixes for each supported MIME so the new sniff passes.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_MAGIC = [
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // size (4 bytes, ignored by detector)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
];

function makeBuffer(magic: number[], totalBytes: number): Uint8Array {
  const buf = new Uint8Array(totalBytes);
  buf.set(magic.slice(0, totalBytes), 0);
  return buf;
}

function makeRequest(
  form: FormData,
  init?: { headers?: Record<string, string> },
): Request {
  return new Request("http://localhost/api/account/avatar", {
    method: "POST",
    headers: init?.headers ?? SAME_ORIGIN_HEADERS,
    body: form,
  });
}

interface FakeFileOpts {
  name: string;
  type: string;
  bytes: number;
  // Optional content override — used by magic-byte tests. When omitted the
  // file is a zero-buffer of `bytes` length (which has no valid magic).
  content?: Uint8Array;
}

function fakeFile(opts: FakeFileOpts): File {
  // The polyfilled File ctor uses the array length for .size, so we give
  // it a Uint8Array of the requested size — keeps the size check honest.
  // Round-trip through .buffer so the BlobPart type narrows to ArrayBuffer
  // (TS strict mode rejects the generic Uint8Array<ArrayBufferLike>).
  const src = opts.content ?? new Uint8Array(opts.bytes);
  const view = new Uint8Array(new ArrayBuffer(src.byteLength));
  view.set(src);
  return new File([view], opts.name, { type: opts.type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/account/avatar", () => {
  it("returns 403 when the request lacks same-origin headers", async () => {
    // CSRF check runs before session lookup, so no session mock needed.
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.png",
        type: "image/png",
        bytes: 32,
        content: makeBuffer(PNG_MAGIC, 32),
      }),
    );
    // No Origin and no Referer — must be refused.
    const req = new Request("http://localhost/api/account/avatar", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 413 when Content-Length exceeds AVATAR_MAX_BYTES + 1024", async () => {
    // Content-Length check runs before session lookup, so no session mock needed.
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.png",
        type: "image/png",
        bytes: 32,
        content: makeBuffer(PNG_MAGIC, 32),
      }),
    );
    const res = await POST(
      makeRequest(fd, {
        headers: {
          ...SAME_ORIGIN_HEADERS,
          "content-length": String(AVATAR_MAX_BYTES + 2048),
        },
      }),
    );
    expect(res.status).toBe(413);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.png",
        type: "image/png",
        bytes: 32,
        content: makeBuffer(PNG_MAGIC, 32),
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
  });

  it("returns 400 for disallowed MIME types (e.g. PDF)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({ name: "x.pdf", type: "application/pdf", bytes: 10 }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when file exceeds 2 MB", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "big.png",
        type: "image/png",
        bytes: 2 * 1024 * 1024 + 1,
        content: makeBuffer(PNG_MAGIC, 2 * 1024 * 1024 + 1),
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when claimed MIME doesn't match magic bytes (HTML labeled as PNG)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const html = new TextEncoder().encode(
      "<html><script>alert(1)</script></html>",
    );
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "evil.png",
        type: "image/png",
        bytes: html.byteLength,
        content: html,
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uploads accepted PNG (with valid magic) and returns the URL", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpload.mockResolvedValueOnce(
      "https://pipeline-uploads.nyc3.digitaloceanspaces.com/avatars/u_1/x.png",
    );
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.png",
        type: "image/png",
        bytes: 100,
        content: makeBuffer(PNG_MAGIC, 100),
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe(
      "https://pipeline-uploads.nyc3.digitaloceanspaces.com/avatars/u_1/x.png",
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [key, , contentType] = mockUpload.mock.calls[0];
    expect(typeof key).toBe("string");
    expect(key).toMatch(/^avatars\/u_1\/.*\.png$/);
    expect(contentType).toBe("image/png");
  });

  it("accepts request with same-origin Origin header (happy path)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpload.mockResolvedValueOnce(
      "https://pipeline-uploads.nyc3.digitaloceanspaces.com/avatars/u_1/x.jpg",
    );
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.jpg",
        type: "image/jpeg",
        bytes: 64,
        content: makeBuffer(JPEG_MAGIC, 64),
      }),
    );
    const res = await POST(
      makeRequest(fd, {
        headers: {
          host: "localhost",
          origin: "http://localhost",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when Spaces helper returns null (not configured)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpload.mockResolvedValueOnce(null);
    const fd = new FormData();
    fd.append(
      "file",
      fakeFile({
        name: "a.webp",
        type: "image/webp",
        bytes: 100,
        content: makeBuffer(WEBP_MAGIC, 100),
      }),
    );
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(502);
  });
});
