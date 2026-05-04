import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/account/data-export", () => ({
  buildExportPayload: vi.fn(),
  serializeExport: vi.fn(),
  stripResumeBinary: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildExportPayload,
  serializeExport,
  stripResumeBinary,
} from "@/lib/account/data-export";
import { GET } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockRate = checkRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockBuild = buildExportPayload as unknown as ReturnType<typeof vi.fn>;
const mockSerialize = serializeExport as unknown as ReturnType<typeof vi.fn>;
const mockStrip = stripResumeBinary as unknown as ReturnType<typeof vi.fn>;

const ALLOWED = { allowed: true, limit: 1, remaining: 0, resetAt: 0 };
const BLOCKED = { allowed: false, limit: 1, remaining: 0, resetAt: 0 };

function fakePayload(): Record<string, unknown> {
  return {
    exportedAt: "2026-05-04T00:00:00.000Z",
    schemaVersion: 1,
    user: {
      id: "u_12345678",
      email: "user@example.com",
      name: null,
      image: null,
      createdAt: "2026-05-04T00:00:00.000Z",
      role: "USER",
    },
    profile: null,
    applications: [],
    emails: [],
    notifications: [],
    notificationPreferences: null,
    subscription: null,
    referrals: { code: null, referredUsers: [] },
    loginEvents: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRate.mockResolvedValue(ALLOWED);
  mockBuild.mockResolvedValue(fakePayload());
});

function sameOriginRequest(): Request {
  return new Request("https://app.example.com/api/account/data-export", {
    method: "GET",
    headers: {
      host: "app.example.com",
      origin: "https://app.example.com",
    },
  });
}

function crossOriginRequest(): Request {
  return new Request("https://app.example.com/api/account/data-export", {
    method: "GET",
    headers: {
      host: "app.example.com",
      origin: "https://evil.example.com",
    },
  });
}

describe("GET /api/account/data-export", () => {
  it("returns 403 when origin is cross-site (CSRF/exfil gate)", async () => {
    const res = await GET(crossOriginRequest());
    expect(res.status).toBe(403);
    expect(mockSession).not.toHaveBeenCalled();
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(401);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited (after successful build + size check)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_12345678" } });
    const json = JSON.stringify(fakePayload());
    mockSerialize.mockReturnValueOnce({ json, bytes: json.length });
    mockRate.mockResolvedValueOnce(BLOCKED);
    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(429);
    // Build + serialize ran — rate limit is a post-success guard against
    // accidental repeat downloads, not a pre-flight gate.
    expect(mockBuild).toHaveBeenCalledTimes(1);
  });

  it("returns 413 when serialized payload exceeds the cap even after stripping the resume", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_12345678" } });
    // Both pre- and post-strip serializations are over the 50 MB cap.
    mockSerialize
      .mockReturnValueOnce({ json: "{}", bytes: 100 * 1024 * 1024 })
      .mockReturnValueOnce({ json: "{}", bytes: 60 * 1024 * 1024 });
    mockStrip.mockReturnValueOnce(fakePayload());
    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too large/i);
    // 413 must NOT consume the rate limit — checked after success only.
    expect(mockRate).not.toHaveBeenCalled();
  });

  it("returns 200 with JSON body, attachment Content-Disposition, and expected top-level keys", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_12345678" } });
    const json = JSON.stringify(fakePayload());
    mockSerialize.mockReturnValueOnce({ json, bytes: json.length });

    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/i);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="pipeline-export-u_123456-/);
    expect(disposition).toMatch(/\.json"$/);

    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        "applications",
        "emails",
        "exportedAt",
        "loginEvents",
        "notificationPreferences",
        "notifications",
        "profile",
        "referrals",
        "schemaVersion",
        "subscription",
        "user",
      ].sort(),
    );
  });

  it("falls back to stripResumeBinary when first serialization is over cap but second is under", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_12345678" } });
    mockSerialize
      .mockReturnValueOnce({ json: "{}", bytes: 100 * 1024 * 1024 })
      .mockReturnValueOnce({ json: '{"ok":true}', bytes: 11 });
    mockStrip.mockReturnValueOnce(fakePayload());

    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(200);
    expect(mockStrip).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when buildExportPayload throws (without consuming rate limit)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_12345678" } });
    mockBuild.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(sameOriginRequest());
    expect(res.status).toBe(500);
    // 500 must not lock the user out — they should be able to retry.
    expect(mockRate).not.toHaveBeenCalled();
  });
});
