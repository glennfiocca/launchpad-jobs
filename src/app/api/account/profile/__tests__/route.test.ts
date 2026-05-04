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
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { PATCH } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = (db.user as unknown as { update: ReturnType<typeof vi.fn> })
  .update;

// Same-origin headers used by every test that exercises the happy path —
// the new CSRF check refuses requests without an Origin or Referer host
// matching the Host header.
const SAME_ORIGIN_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
  host: "localhost",
};

function makeRequest(
  body: unknown,
  init?: { headers?: Record<string, string> },
): Request {
  return new Request("http://localhost/api/account/profile", {
    method: "PATCH",
    headers: init?.headers ?? SAME_ORIGIN_HEADERS,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/account/profile", () => {
  it("returns 403 when the request lacks same-origin headers", async () => {
    // CSRF check runs before session lookup, so no session mock needed.
    // No Origin and no Referer — must be refused.
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Glenn" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ name: "Glenn" }));
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty (refine fails)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when name exceeds 80 chars", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await PATCH(makeRequest({ name: "a".repeat(81) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when image is not a URL", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await PATCH(makeRequest({ image: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when image URL is not on a DO Spaces host", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await PATCH(
      makeRequest({ image: "https://evil.com/avatar.jpg" }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when body has unknown keys (.strict() rejects)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const res = await PATCH(makeRequest({ name: "x", role: "ADMIN" }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 204 and updates only the authed user (name only)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpdate.mockResolvedValueOnce({ id: "u_1" });
    const res = await PATCH(makeRequest({ name: "Glenn" }));
    expect(res.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { name: "Glenn" },
    });
  });

  it("returns 204 and updates image when image is on a DO Spaces host", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpdate.mockResolvedValueOnce({ id: "u_1" });
    const url =
      "https://pipeline-uploads.nyc3.digitaloceanspaces.com/avatars/u_1/abc.png";
    const res = await PATCH(makeRequest({ image: url }));
    expect(res.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { image: url },
    });
  });

  it("allows nulling the avatar image", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    mockUpdate.mockResolvedValueOnce({ id: "u_1" });
    const res = await PATCH(makeRequest({ image: null }));
    expect(res.status).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "u_1" },
      data: { image: null },
    });
  });

  it("scopes updates to the session user (not a body-supplied id)", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_session" } });
    // `id` and `userId` are unknown keys — under .strict() the request is
    // rejected (intentional defense-in-depth). The original behavior of
    // "ignore body-supplied id" still holds because the route never reads
    // those fields; we just now refuse the request rather than silently
    // strip them.
    const res = await PATCH(
      makeRequest({ name: "x", id: "u_other", userId: "u_other" }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    const req = new Request("http://localhost/api/account/profile", {
      method: "PATCH",
      headers: SAME_ORIGIN_HEADERS,
      body: "not-json{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
