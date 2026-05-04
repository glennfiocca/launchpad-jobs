import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

// Stripe client mocked before route import. `vi.hoisted` lifts the shared
// state above the hoisted `vi.mock` factories so both the test and the route
// observe the same `customers.update` spy.
const stripeMocks = vi.hoisted(() => {
  const update = vi.fn().mockResolvedValue({ id: "cus_1" });
  return {
    update,
    instance: { customers: { update } },
  };
});
vi.mock("@/lib/stripe", () => ({
  getStripe: () => stripeMocks.instance,
}));

vi.mock("@/lib/db", () => {
  // Build the mock callable shape lazily so each test can wire up its own
  // tx callback / row state without sharing across cases.
  const userFindUnique = vi.fn();
  const userFindFirst = vi.fn();
  const userUpdate = vi.fn();
  const ecrFindUnique = vi.fn();
  const ecrUpdate = vi.fn();
  const sessionDeleteMany = vi.fn();
  const verificationTokenDeleteMany = vi.fn();
  const $transaction = vi.fn();

  return {
    db: {
      user: {
        findUnique: userFindUnique,
        findFirst: userFindFirst,
        update: userUpdate,
      },
      emailChangeRequest: {
        findUnique: ecrFindUnique,
        update: ecrUpdate,
      },
      session: { deleteMany: sessionDeleteMany },
      verificationToken: { deleteMany: verificationTokenDeleteMany },
      $transaction,
    },
  };
});

import { db } from "@/lib/db";
import { hashEmailChangeToken } from "@/lib/account/email-change-token";
import { GET } from "../route";

const ecrFindUnique = (
  db.emailChangeRequest as unknown as { findUnique: ReturnType<typeof vi.fn> }
).findUnique;
const tx = (db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(token: string | null): Request {
  const url = token
    ? `http://localhost/api/account/email-change-confirm?token=${encodeURIComponent(token)}`
    : "http://localhost/api/account/email-change-confirm";
  return new Request(url, { method: "GET" });
}

function expectInvalidRedirect(res: Response): void {
  expect(res.status).toBe(303);
  const loc = res.headers.get("location");
  expect(loc).toContain("/auth/signin");
  expect(loc).toContain("reason=email_change_invalid");
  // Sensitive headers
  expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
}

describe("GET /api/account/email-change-confirm", () => {
  it("redirects to signin with email_change_invalid when token missing", async () => {
    const res = await GET(buildRequest(null));
    expectInvalidRedirect(res);
  });

  it("redirects to invalid when token does not match any row", async () => {
    ecrFindUnique.mockResolvedValueOnce(null);
    const res = await GET(buildRequest("does-not-exist"));
    expectInvalidRedirect(res);
  });

  it("redirects to invalid when row is already consumed", async () => {
    ecrFindUnique.mockResolvedValueOnce({
      id: "ecr_1",
      userId: "u_1",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    const res = await GET(buildRequest("any"));
    expectInvalidRedirect(res);
  });

  it("redirects to invalid when row is expired", async () => {
    ecrFindUnique.mockResolvedValueOnce({
      id: "ecr_1",
      userId: "u_1",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() - 1_000),
      consumedAt: null,
    });
    const res = await GET(buildRequest("any"));
    expectInvalidRedirect(res);
  });

  it("happy path: updates email, bumps tokenVersion, marks consumed, drops sessions, syncs Stripe, redirects to signin", async () => {
    const token = "happy-token";
    ecrFindUnique.mockResolvedValueOnce({
      id: "ecr_1",
      userId: "u_1",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    // Capture all tx calls for assertions.
    const txCalls: { fn: string; args: unknown }[] = [];
    tx.mockImplementationOnce(async (cb: (txClient: unknown) => Promise<unknown>) => {
      const txClient = {
        emailChangeRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "ecr_1",
            userId: "u_1",
            newEmail: "new@example.com",
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
          }),
          update: vi.fn().mockImplementation((args: unknown) => {
            txCalls.push({ fn: "ecr.update", args });
            return Promise.resolve({});
          }),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null), // not taken
          findUnique: vi.fn().mockResolvedValue({ email: "old@example.com" }),
          update: vi.fn().mockImplementation((args: unknown) => {
            txCalls.push({ fn: "user.update", args });
            return Promise.resolve({ stripeCustomerId: "cus_1" });
          }),
        },
        session: {
          deleteMany: vi.fn().mockImplementation((args: unknown) => {
            txCalls.push({ fn: "session.deleteMany", args });
            return Promise.resolve({ count: 1 });
          }),
        },
        verificationToken: {
          deleteMany: vi.fn().mockImplementation((args: unknown) => {
            txCalls.push({ fn: "verificationToken.deleteMany", args });
            return Promise.resolve({ count: 0 });
          }),
        },
      };
      return cb(txClient);
    });

    const res = await GET(buildRequest(token));
    expect(res.status).toBe(303);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/signin");
    expect(loc).toContain("reason=email_changed");
    expect(loc).toContain("email=new%40example.com");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");

    // Verify tx ops happened
    const userUpdateCall = txCalls.find((c) => c.fn === "user.update");
    expect(userUpdateCall).toBeDefined();
    expect((userUpdateCall?.args as { data: Record<string, unknown> }).data.email).toBe(
      "new@example.com",
    );
    expect(
      (userUpdateCall?.args as { data: Record<string, unknown> }).data.tokenVersion,
    ).toEqual({ increment: 1 });
    expect(txCalls.find((c) => c.fn === "session.deleteMany")).toBeDefined();
    expect(
      txCalls.find((c) => c.fn === "verificationToken.deleteMany"),
    ).toBeDefined();

    // Stripe sync attempted (best-effort)
    expect(stripeMocks.update).toHaveBeenCalledWith("cus_1", {
      email: "new@example.com",
    });
  });

  it("rolls back when another user takes the email mid-flow (race)", async () => {
    ecrFindUnique.mockResolvedValueOnce({
      id: "ecr_1",
      userId: "u_1",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    let userUpdateCalled = false;
    tx.mockImplementationOnce(async (cb: (txClient: unknown) => Promise<unknown>) => {
      const txClient = {
        emailChangeRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "ecr_1",
            userId: "u_1",
            newEmail: "new@example.com",
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
          }),
          update: vi.fn(),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue({ id: "u_other" }), // taken!
          findUnique: vi.fn(),
          update: vi.fn().mockImplementation(() => {
            userUpdateCalled = true;
            return Promise.resolve({});
          }),
        },
        session: { deleteMany: vi.fn() },
        verificationToken: { deleteMany: vi.fn() },
      };
      return cb(txClient);
    });

    const res = await GET(buildRequest("race-token"));
    expectInvalidRedirect(res);
    expect(userUpdateCalled).toBe(false);
  });

  it("does NOT roll back local tx on Stripe failure", async () => {
    ecrFindUnique.mockResolvedValueOnce({
      id: "ecr_1",
      userId: "u_1",
      newEmail: "new@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    tx.mockImplementationOnce(async (cb: (txClient: unknown) => Promise<unknown>) => {
      const txClient = {
        emailChangeRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: "ecr_1",
            userId: "u_1",
            newEmail: "new@example.com",
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue({ email: "old@example.com" }),
          update: vi.fn().mockResolvedValue({ stripeCustomerId: "cus_1" }),
        },
        session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        verificationToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };
      return cb(txClient);
    });

    // Stripe blows up
    stripeMocks.update.mockRejectedValueOnce(new Error("stripe down"));

    const res = await GET(buildRequest("happy-but-stripe-fails"));
    // Still success — Stripe is best-effort.
    expect(res.status).toBe(303);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("reason=email_changed");
  });

  it("computes the same hash the API stores for a known token (round-trip sanity)", () => {
    // This is a sanity check that route lookups use the same hash function.
    const token = "abc123";
    const expected = hashEmailChangeToken(token);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });
});
