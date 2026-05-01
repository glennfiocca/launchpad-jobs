import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted shared state — vi.mock factories are hoisted above imports, so
// we pin our in-memory store via `vi.hoisted` so it's initialized first.
const { docStore, auditLog, upsertImpl } = vi.hoisted(() => {
  const docStore = new Map<string, { id: string; createdAt: Date; updatedAt: Date }>();
  const auditLog: Array<{ action: string; metadata: unknown; applicationId: string }> = [];

  const upsertImpl = vi.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { applicationId_kind: { applicationId: string; kind: string } };
      create: { applicationId: string; kind: string };
      update: Record<string, unknown>;
    }) => {
      const k = `${where.applicationId_kind.applicationId}|${where.applicationId_kind.kind}`;
      const existing = docStore.get(k);
      const id = existing?.id ?? `doc_${docStore.size + 1}`;
      const createdAt = existing?.createdAt ?? new Date();
      // Simulate Prisma: fresh rows have updatedAt === createdAt.
      // Existing rows get updatedAt advanced enough to be measurably newer.
      const updatedAt = existing ? new Date(createdAt.getTime() + 100) : createdAt;
      const merged = { id, createdAt, updatedAt };
      docStore.set(k, merged);
      return existing ? { ...merged, ...update } : { ...merged, ...create };
    }
  );

  return { docStore, auditLog, upsertImpl };
});

vi.mock("@/lib/spaces", () => ({
  uploadPrivateBuffer: vi.fn(async (key: string, buf: Buffer) => ({
    key,
    sizeBytes: buf.byteLength,
  })),
}));

vi.mock("@/lib/db", () => {
  const mockTx = { applicationDocument: { upsert: upsertImpl } };
  return {
    db: {
      $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
      applicationDocument: { upsert: upsertImpl },
      applicationAuditLog: {
        create: vi.fn(async ({ data }: { data: { action: string; metadata: unknown; applicationId: string } }) => {
          auditLog.push(data);
          return { id: `audit_${auditLog.length}` };
        }),
      },
    },
  };
});

import { generateAndAttachOperatorSummary } from "../generate-and-attach-summary";

const snapshot = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  boardToken: "acme",
  externalId: "12345",
  questionAnswers: {},
  questionMeta: [],
  pendingQuestions: [],
  snapshotAt: "2026-04-30T12:00:00.000Z",
};

describe("generateAndAttachOperatorSummary", () => {
  beforeEach(() => {
    docStore.clear();
    auditLog.length = 0;
    vi.clearAllMocks();
  });

  it("creates a single ApplicationDocument row on first run", async () => {
    const result = await generateAndAttachOperatorSummary({
      applicationId: "app_1",
      jobTitle: "Engineer",
      companyName: "Acme",
      applyUrl: null,
      snapshot,
    });
    expect(result.regenerated).toBe(false);
    expect(docStore.size).toBe(1);
    const [audit] = auditLog;
    expect(audit.action).toBe("PDF_GENERATED");
    expect(audit.applicationId).toBe("app_1");
  });

  it("does not duplicate rows on repeated transitions (idempotent upsert)", async () => {
    await generateAndAttachOperatorSummary({
      applicationId: "app_1",
      jobTitle: "Engineer",
      companyName: "Acme",
      applyUrl: null,
      snapshot,
    });
    const second = await generateAndAttachOperatorSummary({
      applicationId: "app_1",
      jobTitle: "Engineer",
      companyName: "Acme",
      applyUrl: null,
      snapshot,
    });
    expect(docStore.size).toBe(1);
    expect(second.regenerated).toBe(true);
    expect(auditLog.map((a) => a.action)).toEqual(["PDF_GENERATED", "PDF_REGENERATED"]);
  });

  it("uses a stable spaces key for a given application (overwrites bytes in-place)", async () => {
    const r1 = await generateAndAttachOperatorSummary({
      applicationId: "app_2",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot,
    });
    const r2 = await generateAndAttachOperatorSummary({
      applicationId: "app_2",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot,
    });
    expect(r1.spacesKey).toBe(r2.spacesKey);
    expect(r1.spacesKey).toMatch(/^application-documents\/app_2\//);
  });
});
