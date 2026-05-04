import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(async () => "mocked.jwt.token"),
}));

import { db } from "@/lib/db";
import { encode } from "next-auth/jwt";

const mockDb = db as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockEncode = encode as unknown as ReturnType<typeof vi.fn>;

// Build a NextRequest for the route handler.
function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/test/signin-as", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 16+ char fixture secret — long enough to pass the length gate.
const VALID_SECRET = "x".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  // Default to dev so the env gate is open unless a test overrides.
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TEST_AUTH_SECRET", VALID_SECRET);
  vi.stubEnv("NEXTAUTH_SECRET", "next-auth-secret-fixture-value");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/test/signin-as", () => {
  it("returns 404 when TEST_AUTH_SECRET is unset", async () => {
    vi.stubEnv("TEST_AUTH_SECRET", "");
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({ email: "e2e-test@trypipeline.ai", secret: "anything" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when TEST_AUTH_SECRET is shorter than 16 chars", async () => {
    vi.stubEnv("TEST_AUTH_SECRET", "short");
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({ email: "e2e-test@trypipeline.ai", secret: "short" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when secret does not match", async () => {
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-test@trypipeline.ai",
        secret: "y".repeat(32), // same length, different content
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret is correct length-mismatched (timing-safe rejects)", async () => {
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-test@trypipeline.ai",
        secret: "z".repeat(33),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when email does not start with e2e-", async () => {
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "real-user@trypipeline.ai",
        secret: VALID_SECRET,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when email does not end with @trypipeline.ai", async () => {
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-test@example.com",
        secret: VALID_SECRET,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when test user is not seeded", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-missing@trypipeline.ai",
        secret: VALID_SECRET,
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("not seeded");
  });

  it("returns 400 on invalid body", async () => {
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({ email: "not-an-email", secret: VALID_SECRET }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 + sets session cookie with valid inputs and seeded user", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "user-id-123",
      email: "e2e-test@trypipeline.ai",
      name: "E2E Test User",
      role: "USER",
    });
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-test@trypipeline.ai",
        secret: VALID_SECRET,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; userId: string };
    expect(body.success).toBe(true);
    expect(body.userId).toBe("user-id-123");

    // Cookie must be set with the dev (non-secure) name.
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("next-auth.session-token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=lax");

    // Encode was called with role + sub claims.
    expect(mockEncode).toHaveBeenCalledTimes(1);
    const encodeArgs = mockEncode.mock.calls[0]?.[0] as {
      token: Record<string, unknown>;
      secret: string;
    };
    expect(encodeArgs.token.sub).toBe("user-id-123");
    expect(encodeArgs.token.email).toBe("e2e-test@trypipeline.ai");
    expect(encodeArgs.token.role).toBe("USER");
    expect(encodeArgs.secret).toBe("next-auth-secret-fixture-value");
  });

  it("returns 500 when NEXTAUTH_SECRET is missing", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "user-id-123",
      email: "e2e-test@trypipeline.ai",
      name: "E2E Test User",
      role: "USER",
    });
    const { POST } = await import("../signin-as/route");
    const res = await POST(
      makeRequest({
        email: "e2e-test@trypipeline.ai",
        secret: VALID_SECRET,
      }),
    );
    expect(res.status).toBe(500);
  });
});
