import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    emailChangeRequest: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmailChangeVerify: vi.fn(),
  sendEmailChangeNotice: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import {
  sendEmailChangeNotice,
  sendEmailChangeVerify,
} from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockUserFind = (
  db.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
).findUnique;
const mockUserFirst = (
  db.user as unknown as { findFirst: ReturnType<typeof vi.fn> }
).findFirst;
const mockCreate = (
  db.emailChangeRequest as unknown as { create: ReturnType<typeof vi.fn> }
).create;
const mockVerify = sendEmailChangeVerify as unknown as ReturnType<typeof vi.fn>;
const mockNotice = sendEmailChangeNotice as unknown as ReturnType<typeof vi.fn>;
const mockRate = checkRateLimit as unknown as ReturnType<typeof vi.fn>;

const ALLOWED = { allowed: true, limit: 5, remaining: 4, resetAt: 0 };
const BLOCKED = { allowed: false, limit: 1, remaining: 0, resetAt: 0 };

const SAME_ORIGIN: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
  host: "localhost",
};

function makeRequest(
  body: unknown,
  init?: { headers?: Record<string, string> },
): Request {
  return new Request("http://localhost/api/account/email-change-request", {
    method: "POST",
    headers: init?.headers ?? SAME_ORIGIN,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default — every test that gets past rate-limit assumes ALLOWED.
  mockRate.mockResolvedValue(ALLOWED);
});

describe("POST /api/account/email-change-request", () => {
  it("returns 403 when the request is cross-origin", async () => {
    const req = new Request("http://localhost/api/account/email-change-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newEmail: "x@y.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ newEmail: "x@y.com" }));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 429 when per-minute rate limit is exceeded", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockRate.mockResolvedValueOnce(BLOCKED);
    const res = await POST(makeRequest({ newEmail: "new@example.com" }));
    expect(res.status).toBe(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 429 when per-hour rate limit is exceeded", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockRate.mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(BLOCKED);
    const res = await POST(makeRequest({ newEmail: "new@example.com" }));
    expect(res.status).toBe(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid email", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await POST(makeRequest({ newEmail: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when newEmail equals current email", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUserFind.mockResolvedValueOnce({
      email: "current@example.com",
      normalizedEmail: "current@example.com",
    });
    const res = await POST(makeRequest({ newEmail: "current@example.com" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when newEmail is taken by another user", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUserFind.mockResolvedValueOnce({
      email: "current@example.com",
      normalizedEmail: "current@example.com",
    });
    mockUserFirst.mockResolvedValueOnce({ id: "u_2" });
    const res = await POST(makeRequest({ newEmail: "taken@example.com" }));
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 204 on success and writes a row + sends both emails", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUserFind.mockResolvedValueOnce({
      email: "current@example.com",
      normalizedEmail: "current@example.com",
    });
    mockUserFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "ecr_1" });
    mockVerify.mockResolvedValueOnce({});
    mockNotice.mockResolvedValueOnce({});

    const res = await POST(makeRequest({ newEmail: "new@example.com" }));
    expect(res.status).toBe(204);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const created = mockCreate.mock.calls[0][0];
    expect(created.data.userId).toBe("u_1");
    expect(created.data.newEmail).toBe("new@example.com");
    expect(typeof created.data.tokenHash).toBe("string");
    expect((created.data.tokenHash as string).length).toBe(64); // hex sha256
    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockNotice).toHaveBeenCalledTimes(1);
    // Verification email goes to the NEW address
    expect(mockVerify.mock.calls[0][0].to).toBe("new@example.com");
    // Notice goes to the OLD address
    expect(mockNotice.mock.calls[0][0].to).toBe("current@example.com");
  });

  it("returns 204 even if notice email fails (best-effort)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUserFind.mockResolvedValueOnce({
      email: "current@example.com",
      normalizedEmail: "current@example.com",
    });
    mockUserFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "ecr_1" });
    mockVerify.mockResolvedValueOnce({});
    mockNotice.mockRejectedValueOnce(new Error("smtp down"));

    const res = await POST(makeRequest({ newEmail: "new@example.com" }));
    expect(res.status).toBe(204);
  });

  it("returns 500 if verification email send fails (hard failure)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUserFind.mockResolvedValueOnce({
      email: "current@example.com",
      normalizedEmail: "current@example.com",
    });
    mockUserFirst.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "ecr_1" });
    mockVerify.mockRejectedValueOnce(new Error("smtp down"));

    const res = await POST(makeRequest({ newEmail: "new@example.com" }));
    expect(res.status).toBe(500);
  });
});
