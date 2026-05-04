import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    application: { findMany: vi.fn() },
    applicationEmail: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn() },
    referral: { findMany: vi.fn() },
    loginEvent: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  buildExportPayload,
  serializeExport,
  stripResumeBinary,
  type ExportPayload,
} from "../data-export";
import { DATA_EXPORT_MAX_BYTES } from "@/lib/settings/constants";

type Mocked<T> = T & { [k in keyof T]: ReturnType<typeof vi.fn> };
const dbm = db as unknown as {
  user: Mocked<{ findUnique: () => unknown }>;
  userProfile: Mocked<{ findUnique: () => unknown }>;
  application: Mocked<{ findMany: () => unknown }>;
  applicationEmail: Mocked<{ findMany: () => unknown }>;
  notification: Mocked<{ findMany: () => unknown }>;
  notificationPreference: Mocked<{ findUnique: () => unknown }>;
  subscription: Mocked<{ findUnique: () => unknown }>;
  referral: Mocked<{ findMany: () => unknown }>;
  loginEvent: Mocked<{ findMany: () => unknown }>;
};

const NOW = new Date("2026-05-01T12:00:00.000Z");

function setupHappyPath(overrides?: {
  resumeData?: Buffer | null;
  referrals?: Array<{ createdAt: Date; status: string }>;
}): void {
  dbm.user.findUnique.mockResolvedValue({
    id: "u_1",
    email: "user@example.com",
    name: "Test User",
    image: null,
    createdAt: NOW,
    role: "USER",
    referralCode: "ABC123",
    subscriptionStatus: "FREE",
  });
  dbm.userProfile.findUnique.mockResolvedValue({
    firstName: "Test",
    lastName: "User",
    preferredFirstName: null,
    email: "user@example.com",
    phone: "555-0100",
    location: "NYC",
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    headline: null,
    summary: null,
    currentTitle: null,
    currentCompany: null,
    yearsExperience: null,
    desiredSalaryMin: null,
    desiredSalaryMax: null,
    openToRemote: true,
    openToHybrid: true,
    openToOnsite: false,
    highestDegree: null,
    fieldOfStudy: null,
    university: null,
    graduationYear: null,
    workAuthorization: null,
    requiresSponsorship: false,
    resumeFileName: "resume.pdf",
    resumeMimeType: "application/pdf",
    resumeUrl: "https://spaces.example/resume.pdf",
    resumeData:
      overrides?.resumeData === undefined
        ? Buffer.from("resume bytes")
        : overrides.resumeData,
    customAnswers: { foo: "bar" },
    isComplete: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  dbm.application.findMany.mockResolvedValue([
    {
      id: "app_1",
      status: "APPLIED",
      submissionStatus: "SUBMITTED",
      externalApplicationId: "ext_1",
      userNotes: "note",
      appliedAt: NOW,
      updatedAt: NOW,
      job: {
        title: "Engineer",
        location: "Remote",
        department: "Eng",
        employmentType: "FULL_TIME",
        remote: true,
        company: { name: "Acme" },
      },
    },
  ]);
  dbm.applicationEmail.findMany.mockResolvedValue([
    {
      id: "em_1",
      applicationId: "app_1",
      from: "ats@acme.com",
      to: "user@example.com",
      subject: "Hello",
      body: "We received your application",
      direction: "inbound",
      receivedAt: NOW,
      createdAt: NOW,
    },
  ]);
  dbm.notification.findMany.mockResolvedValue([]);
  dbm.notificationPreference.findUnique.mockResolvedValue(null);
  dbm.subscription.findUnique.mockResolvedValue(null);
  dbm.referral.findMany.mockResolvedValue(
    overrides?.referrals ?? [
      { createdAt: NOW, status: "CONVERTED" },
      { createdAt: NOW, status: "PENDING" },
    ],
  );
  dbm.loginEvent.findMany.mockResolvedValue([
    {
      createdAt: NOW,
      ipAddress: null,
      userAgent: null,
      provider: "email",
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildExportPayload", () => {
  it("returns an ExportPayload with the documented top-level shape", async () => {
    setupHappyPath();
    const payload = await buildExportPayload("u_1");

    expect(Object.keys(payload).sort()).toEqual(
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
    expect(payload.schemaVersion).toBe(1);
    expect(payload.user.id).toBe("u_1");
    expect(payload.user.email).toBe("user@example.com");
    expect(payload.applications).toHaveLength(1);
    expect(payload.emails).toHaveLength(1);
  });

  it("base64-encodes resumeData when present", async () => {
    setupHappyPath();
    const payload = await buildExportPayload("u_1");
    expect(payload.profile?.resumeData).toBe(
      Buffer.from("resume bytes").toString("base64"),
    );
    expect(payload.profile?.resumeData_omitted_due_to_size).toBeUndefined();
  });

  it("scrubs other-user identifiers from referral history", async () => {
    setupHappyPath({
      referrals: [
        { createdAt: NOW, status: "CONVERTED" },
        { createdAt: NOW, status: "PENDING" },
      ],
    });
    const payload = await buildExportPayload("u_1");

    // Each referredUsers entry has EXACTLY two keys: joinedAt + converted.
    // Adding extra keys (refereeId, refereeEmail) would be a regression.
    for (const r of payload.referrals.referredUsers) {
      expect(Object.keys(r).sort()).toEqual(["converted", "joinedAt"]);
    }
    expect(payload.referrals.referredUsers[0].converted).toBe(true);
    expect(payload.referrals.referredUsers[1].converted).toBe(false);
  });

  it("never includes Stripe customer ID or OAuth tokens in serialized output", async () => {
    setupHappyPath();
    const payload = await buildExportPayload("u_1");
    const json = JSON.stringify(payload);
    expect(json).not.toMatch(/stripeCustomerId/i);
    expect(json).not.toMatch(/stripeSubscriptionId/i);
    expect(json).not.toMatch(/access_token/i);
    expect(json).not.toMatch(/refresh_token/i);
    expect(json).not.toMatch(/id_token/i);
  });

  it("sorts applications and emails by createdAt ascending (deterministic output)", async () => {
    const earlier = new Date("2026-04-01T00:00:00.000Z");
    const later = new Date("2026-04-15T00:00:00.000Z");
    setupHappyPath();
    dbm.application.findMany.mockResolvedValue([
      {
        id: "app_a",
        status: "APPLIED",
        submissionStatus: "SUBMITTED",
        externalApplicationId: null,
        userNotes: null,
        appliedAt: earlier,
        updatedAt: earlier,
        job: {
          title: "Earlier",
          location: null,
          department: null,
          employmentType: null,
          remote: false,
          company: { name: "A" },
        },
      },
      {
        id: "app_b",
        status: "APPLIED",
        submissionStatus: "SUBMITTED",
        externalApplicationId: null,
        userNotes: null,
        appliedAt: later,
        updatedAt: later,
        job: {
          title: "Later",
          location: null,
          department: null,
          employmentType: null,
          remote: false,
          company: { name: "B" },
        },
      },
    ]);
    const payload = await buildExportPayload("u_1");
    expect(payload.applications.map((a) => a.id)).toEqual(["app_a", "app_b"]);
  });

  it("returns null profile when user has no profile row", async () => {
    setupHappyPath();
    dbm.userProfile.findUnique.mockResolvedValue(null);
    const payload = await buildExportPayload("u_1");
    expect(payload.profile).toBeNull();
  });

  it("throws if the user is not found", async () => {
    setupHappyPath();
    dbm.user.findUnique.mockResolvedValue(null);
    await expect(buildExportPayload("u_1")).rejects.toThrow(/User not found/);
  });
});

describe("stripResumeBinary", () => {
  it("replaces resumeData with the omitted sentinel and preserves the URL", async () => {
    setupHappyPath();
    const payload = await buildExportPayload("u_1");
    const stripped = stripResumeBinary(payload);
    expect(stripped.profile?.resumeData).toBeNull();
    expect(stripped.profile?.resumeData_omitted_due_to_size).toBe(true);
    expect(stripped.profile?.resumeUrl).toBe(payload.profile?.resumeUrl);
    // Immutability — original is unchanged.
    expect(payload.profile?.resumeData_omitted_due_to_size).toBeUndefined();
  });

  it("is a no-op when profile is null", async () => {
    const payload: ExportPayload = {
      exportedAt: NOW.toISOString(),
      schemaVersion: 1,
      user: {
        id: "u_1",
        email: null,
        name: null,
        image: null,
        createdAt: NOW.toISOString(),
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
    const stripped = stripResumeBinary(payload);
    expect(stripped).toEqual(payload);
  });
});

describe("serializeExport — 50 MB cap behaviour", () => {
  it("kicks in stripResumeBinary when initial serialization exceeds the cap", async () => {
    // Construct an oversize fake by mocking a huge resumeData buffer.
    // 51 MB filled buffer → base64 is ~68 MB, definitely over 50 MB.
    const huge = Buffer.alloc(51 * 1024 * 1024, 0x41);
    setupHappyPath({ resumeData: huge });

    const payload = await buildExportPayload("u_1");
    const first = serializeExport(payload);
    expect(first.bytes).toBeGreaterThan(DATA_EXPORT_MAX_BYTES);

    const stripped = stripResumeBinary(payload);
    const second = serializeExport(stripped);
    expect(second.bytes).toBeLessThan(DATA_EXPORT_MAX_BYTES);
    expect(stripped.profile?.resumeData_omitted_due_to_size).toBe(true);
  });

  it("returns a JSON string and accurate utf8 byte count", async () => {
    setupHappyPath();
    const payload = await buildExportPayload("u_1");
    const { json, bytes } = serializeExport(payload);
    expect(typeof json).toBe("string");
    expect(bytes).toBe(Buffer.byteLength(json, "utf8"));
  });
});
