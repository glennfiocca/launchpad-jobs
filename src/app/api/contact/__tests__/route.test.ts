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
    contactMessage: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendContactFormToAdmin: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { sendContactFormToAdmin } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockCreate = (
  db.contactMessage as unknown as { create: ReturnType<typeof vi.fn> }
).create;
const mockUpdate = (
  db.contactMessage as unknown as { update: ReturnType<typeof vi.fn> }
).update;
const mockSend = sendContactFormToAdmin as unknown as ReturnType<typeof vi.fn>;
const mockRate = checkRateLimit as unknown as ReturnType<typeof vi.fn>;

const ALLOWED = { allowed: true, limit: 3, remaining: 2, resetAt: 0 };
const BLOCKED = { allowed: false, limit: 3, remaining: 0, resetAt: Date.now() + 60_000 };

const SAME_ORIGIN: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
  host: "localhost",
};

const VALID_BODY = {
  name: "Jane Doe",
  email: "jane@example.com",
  category: "general",
  pageUrl: "https://trypipeline.ai/jobs",
  message: "Hi there — I'd like to ask a question about my account please.",
};

function makeRequest(
  body: unknown,
  init?: { headers?: Record<string, string> },
): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: init?.headers ?? SAME_ORIGIN,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRate.mockResolvedValue(ALLOWED);
  mockSession.mockResolvedValue(null);
});

describe("POST /api/contact", () => {
  it("returns 403 on cross-origin requests", async () => {
    const req = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body (missing required fields)", async () => {
    const res = await POST(makeRequest({ name: "x" }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeRequest("{ not json"));
    expect(res.status).toBe(400);
  });

  it("returns 429 with Retry-After when rate-limited", async () => {
    mockRate.mockResolvedValueOnce(BLOCKED);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("traps honeypot — returns 200 without creating a row or sending email", async () => {
    const trapped = { ...VALID_BODY, website: "https://spam.example" };
    const res = await POST(makeRequest(trapped));
    expect(res.status).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("happy path — persists row, sends email, marks deliveredAt", async () => {
    const createdAt = new Date("2026-05-04T12:00:00.000Z");
    mockCreate.mockResolvedValueOnce({ id: "cm_1", createdAt });
    mockSend.mockResolvedValueOnce({ ok: true });
    mockUpdate.mockResolvedValueOnce({});

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.name).toBe("Jane Doe");
    expect(createArgs.data.email).toBe("jane@example.com");
    expect(createArgs.data.category).toBe("general");
    expect(createArgs.data.pageUrl).toBe("https://trypipeline.ai/jobs");
    expect(createArgs.data.userId).toBeNull();
    expect(createArgs.data.ipAddress).toBe("127.0.0.1");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sendArgs = mockSend.mock.calls[0][0];
    expect(sendArgs.email).toBe("jane@example.com");
    expect(sendArgs.createdAt).toBe(createdAt);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdate.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("cm_1");
    expect(updateArgs.data.deliveredAt).toBeInstanceOf(Date);
  });

  it("send failure — still 200, row persists, deliveredAt NOT set", async () => {
    const createdAt = new Date("2026-05-04T12:00:00.000Z");
    mockCreate.mockResolvedValueOnce({ id: "cm_2", createdAt });
    mockSend.mockResolvedValueOnce({ ok: false, error: "smtp down" });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("attaches userId when a session is present", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_42", email: "x@y.com" } });
    const createdAt = new Date();
    mockCreate.mockResolvedValueOnce({ id: "cm_3", createdAt });
    mockSend.mockResolvedValueOnce({ ok: true });
    mockUpdate.mockResolvedValueOnce({});

    await POST(makeRequest(VALID_BODY));

    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.userId).toBe("u_42");
  });
});
