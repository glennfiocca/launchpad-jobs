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
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockFindUnique = (
  db.user as unknown as { findUnique: ReturnType<typeof vi.fn> }
).findUnique;
const mockUpdate = (
  db.user as unknown as { update: ReturnType<typeof vi.fn> }
).update;

const SAME_ORIGIN_GPC: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
  host: "localhost",
  "sec-gpc": "1",
};

function makeRequest(headers: Record<string, string> = SAME_ORIGIN_GPC): Request {
  return new Request("http://localhost/api/account/gpc-opt-out", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue(null);
});

describe("POST /api/account/gpc-opt-out", () => {
  it("returns 403 on cross-origin requests", async () => {
    const res = await POST(
      makeRequest({
        "content-type": "application/json",
        "sec-gpc": "1",
        // No origin/host → isSameOrigin returns false.
      }),
    );
    expect(res.status).toBe(403);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when Sec-GPC header is not '1'", async () => {
    const res = await POST(
      makeRequest({
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        // sec-gpc missing
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when Sec-GPC header is '0'", async () => {
    const res = await POST(
      makeRequest({
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        "sec-gpc": "0",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when Sec-GPC is 'true' (only literal '1' is valid)", async () => {
    const res = await POST(
      makeRequest({
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        "sec-gpc": "true",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when only the propagated x-pipeline-gpc header is present (defense-in-depth — middleware spoofing must not bypass the live Sec-GPC check)", async () => {
    const res = await POST(
      makeRequest({
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        // sec-gpc missing; only the internal propagated header is set
        "x-pipeline-gpc": "1",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated (with valid Sec-GPC)", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("happy path — writes flag and returns alreadySet:false", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1", email: "x@y.com" } });
    mockFindUnique.mockResolvedValueOnce({ gpcOptOut: false });
    mockUpdate.mockResolvedValueOnce({ id: "u_1", gpcOptOut: true });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alreadySet).toBe(false);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdate.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("u_1");
    expect(updateArgs.data.gpcOptOut).toBe(true);
  });

  it("idempotent — already true, no write, returns alreadySet:true", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_2", email: "y@z.com" } });
    mockFindUnique.mockResolvedValueOnce({ gpcOptOut: true });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.alreadySet).toBe(true);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when session.user.id resolves to a missing user", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "ghost", email: "g@h.com" } });
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 on DB failure (logged, not surfaced)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_3", email: "a@b.com" } });
    mockFindUnique.mockRejectedValueOnce(new Error("db unreachable"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
