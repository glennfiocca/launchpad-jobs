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
    $transaction: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockTx = (db as unknown as { $transaction: ReturnType<typeof vi.fn> })
  .$transaction;

const SAME_ORIGIN: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
  host: "localhost",
};

function makeRequest(headers: Record<string, string> = SAME_ORIGIN): Request {
  return new Request("http://localhost/api/account/sessions/all", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/account/sessions/all", () => {
  it("returns 403 when the request is cross-origin", async () => {
    const req = new Request("http://localhost/api/account/sessions/all", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockTx).not.toHaveBeenCalled();
  });

  it("returns 204 and runs both tx writes (increment tokenVersion + delete sessions)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });

    // Capture the tx callback so we can verify it issues the right calls.
    const txUserUpdate = vi.fn().mockResolvedValue({});
    const txSessionDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    mockTx.mockImplementationOnce(async (fn: unknown) => {
      const callback = fn as (tx: unknown) => Promise<void>;
      await callback({
        user: { update: txUserUpdate },
        session: { deleteMany: txSessionDeleteMany },
      });
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(204);

    expect(txUserUpdate).toHaveBeenCalledTimes(1);
    expect(txUserUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "u_1" },
      data: { tokenVersion: { increment: 1 } },
    });

    expect(txSessionDeleteMany).toHaveBeenCalledTimes(1);
    expect(txSessionDeleteMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "u_1" },
    });
  });

  it("returns 500 if the transaction throws", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockTx.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
