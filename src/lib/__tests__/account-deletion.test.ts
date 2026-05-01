import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

type TxClient = {
  user: { update: ReturnType<typeof vi.fn> };
  userProfile: { updateMany: ReturnType<typeof vi.fn> };
  session: { deleteMany: ReturnType<typeof vi.fn> };
  account: { deleteMany: ReturnType<typeof vi.fn> };
  verificationToken: { deleteMany: ReturnType<typeof vi.fn> };
};

const txClient: TxClient = {
  user: { update: vi.fn() },
  userProfile: { updateMany: vi.fn() },
  session: { deleteMany: vi.fn() },
  account: { deleteMany: vi.fn() },
  verificationToken: { deleteMany: vi.fn() },
};

vi.mock("@prisma/client", () => ({
  Prisma: { JsonNull: Symbol("Prisma.JsonNull") },
}));

vi.mock("@/lib/db", () => ({
  db: {
    subscription: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: TxClient) => Promise<void>) => {
      await cb(txClient);
    }),
  },
}));

const stripeUpdate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      update: stripeUpdate,
    },
  }),
}));

import { db } from "@/lib/db";
import { deleteUserAccount } from "../account-deletion";

const mockDb = db as unknown as {
  subscription: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  txClient.user.update.mockReset();
  txClient.userProfile.updateMany.mockReset();
  txClient.session.deleteMany.mockReset();
  txClient.account.deleteMany.mockReset();
  txClient.verificationToken.deleteMany.mockReset();
  txClient.user.update.mockResolvedValue({});
  txClient.userProfile.updateMany.mockResolvedValue({ count: 1 });
  txClient.session.deleteMany.mockResolvedValue({ count: 2 });
  txClient.account.deleteMany.mockResolvedValue({ count: 1 });
  txClient.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.subscription.findUnique.mockResolvedValue(null);
  mockDb.user.findUnique.mockResolvedValue({ email: "old@example.com" });
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: TxClient) => Promise<void>) => {
      await cb(txClient);
    }
  );
});

describe("deleteUserAccount", () => {
  const userId = "user_123";

  it("rewrites email to deleted-{userId}@deleted.local and sets deletedAt", async () => {
    await deleteUserAccount(userId);

    expect(txClient.user.update).toHaveBeenCalledTimes(1);
    const args = txClient.user.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: userId });
    expect(args.data.email).toBe(`deleted-${userId}@deleted.local`);
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it("nulls out name, image, password, normalizedEmail, referralCode", async () => {
    await deleteUserAccount(userId);

    const data = txClient.user.update.mock.calls[0][0].data;
    expect(data.name).toBeNull();
    expect(data.image).toBeNull();
    expect(data.password).toBeNull();
    expect(data.normalizedEmail).toBeNull();
    expect(data.referralCode).toBeNull();
  });

  it("preserves stripeCustomerId for ledger linkage (not touched)", async () => {
    await deleteUserAccount(userId);

    const data = txClient.user.update.mock.calls[0][0].data;
    expect("stripeCustomerId" in data).toBe(false);
  });

  it("wipes UserProfile PII via updateMany", async () => {
    await deleteUserAccount(userId);

    expect(txClient.userProfile.updateMany).toHaveBeenCalledTimes(1);
    const call = txClient.userProfile.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId });
    const d = call.data;
    expect(d.firstName).toBe("");
    expect(d.lastName).toBe("");
    expect(d.phone).toBeNull();
    expect(d.location).toBeNull();
    expect(d.linkedinUrl).toBeNull();
    expect(d.githubUrl).toBeNull();
    expect(d.portfolioUrl).toBeNull();
    expect(d.headline).toBeNull();
    expect(d.summary).toBeNull();
    expect(d.resumeData).toBeNull();
    expect(d.resumeUrl).toBeNull();
    expect(d.resumeFileName).toBeNull();
    expect(d.voluntaryGender).toBeNull();
    expect(d.voluntaryRace).toBeNull();
    expect(d.voluntaryVeteranStatus).toBeNull();
    expect(d.voluntaryDisability).toBeNull();
    expect(d.isComplete).toBe(false);
  });

  it("deletes all sessions for the user (force sign-out)", async () => {
    await deleteUserAccount(userId);

    expect(txClient.session.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
  });

  it("cancels Stripe subscription at period end if active subscription exists", async () => {
    mockDb.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_123",
    });
    stripeUpdate.mockResolvedValue({});

    await deleteUserAccount(userId);

    expect(stripeUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: true,
    });
  });

  it("does NOT throw and still completes local deletion when Stripe fails", async () => {
    mockDb.subscription.findUnique.mockResolvedValue({
      stripeSubscriptionId: "sub_456",
    });
    stripeUpdate.mockRejectedValue(new Error("Stripe down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteUserAccount(userId)).resolves.toBeUndefined();

    expect(txClient.user.update).toHaveBeenCalled();
    expect(txClient.session.deleteMany).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("skips Stripe call when no subscription exists", async () => {
    mockDb.subscription.findUnique.mockResolvedValue(null);

    await deleteUserAccount(userId);

    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it("clears customAnswers via Prisma.JsonNull (not undefined)", async () => {
    const { Prisma } = await import("@prisma/client");
    await deleteUserAccount(userId);
    const profileData = txClient.userProfile.updateMany.mock.calls[0][0].data;
    expect(profileData.customAnswers).toBe(Prisma.JsonNull);
  });

  it("deletes OAuth Account rows for the user (PII scrub)", async () => {
    await deleteUserAccount(userId);
    expect(txClient.account.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
  });

  it("deletes pending VerificationToken rows for the old email", async () => {
    mockDb.user.findUnique.mockResolvedValue({ email: "old@example.com" });
    await deleteUserAccount(userId);
    expect(txClient.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "old@example.com" },
    });
  });

  it("skips VerificationToken cleanup when old email is unreadable", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    await deleteUserAccount(userId);
    expect(txClient.verificationToken.deleteMany).not.toHaveBeenCalled();
  });
});
