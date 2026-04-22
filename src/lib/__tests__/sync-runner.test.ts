import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  runSync,
  reconcileStaleRuns,
  acquireSyncLock,
  executeSyncWork,
  getStaleThresholdMs,
  SyncAlreadyRunningError,
} from "../sync-runner"

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  db: {
    syncLog: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    syncBoardResult: {
      create: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}))

vi.mock("@/lib/greenhouse", () => ({
  getActiveBoards: vi.fn(),
  syncGreenhouseBoard: vi.fn(),
}))

// Helper to get typed mock references after import
import { db } from "@/lib/db"
import { getActiveBoards, syncGreenhouseBoard } from "@/lib/greenhouse"

const mockDb = db as unknown as {
  syncLog: {
    findFirst: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  syncBoardResult: {
    create: ReturnType<typeof vi.fn>
  }
  $executeRaw: ReturnType<typeof vi.fn>
}
const mockGetActiveBoards = getActiveBoards as ReturnType<typeof vi.fn>
const mockSyncGreenhouseBoard = syncGreenhouseBoard as ReturnType<typeof vi.fn>

// --- Test helpers ---

const defaultStartedAt = new Date()

function setupLockAcquired() {
  // reconcileStaleRuns: no stale runs
  mockDb.syncLog.findMany.mockResolvedValue([])
  // acquireSyncLock: atomic insert succeeds
  mockDb.$executeRaw.mockResolvedValue(1)
  // executeSyncWork: fetch the SyncLog row
  mockDb.syncLog.findUniqueOrThrow.mockResolvedValue({ startedAt: defaultStartedAt })
}

function setupLockRejected(blockingId: string) {
  // reconcileStaleRuns: no stale runs
  mockDb.syncLog.findMany.mockResolvedValue([])
  // acquireSyncLock: atomic insert fails (row already exists)
  mockDb.$executeRaw.mockResolvedValue(0)
  // Look up the blocking run
  mockDb.syncLog.findFirst.mockResolvedValue({ id: blockingId })
}

// --- Tests ---

describe("runSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: lock acquired, no boards
    setupLockAcquired()
    mockDb.syncLog.update.mockResolvedValue({ status: "SUCCESS" })
    mockGetActiveBoards.mockResolvedValue([])
  })

  describe("concurrency guard", () => {
    it("throws SyncAlreadyRunningError when a RUNNING log exists", async () => {
      setupLockRejected("existing-log-id")

      await expect(runSync("cron")).rejects.toThrow(SyncAlreadyRunningError)
      await expect(runSync("cron")).rejects.toThrow("Sync already running (syncLogId: existing-log-id)")
    })

    it("exposes runningSyncLogId on the error", async () => {
      setupLockRejected("existing-log-id")

      try {
        await runSync("cron")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(SyncAlreadyRunningError)
        expect((err as SyncAlreadyRunningError).runningSyncLogId).toBe("existing-log-id")
      }
    })
  })

  describe("terminal status on fatal error", () => {
    it("marks SyncLog as FAILURE if getActiveBoards throws", async () => {
      mockGetActiveBoards.mockRejectedValue(new Error("DB connection lost"))

      await expect(runSync("cron")).rejects.toThrow("DB connection lost")

      expect(mockDb.syncLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILURE",
            errorSummary: expect.stringContaining("Fatal error: DB connection lost"),
          }),
        })
      )
    })

    it("sets completedAt on the FAILURE update", async () => {
      mockGetActiveBoards.mockRejectedValue(new Error("timeout"))

      await expect(runSync("cron")).rejects.toThrow()

      const updateCall = mockDb.syncLog.update.mock.calls[0][0]
      expect(updateCall.data.completedAt).toBeInstanceOf(Date)
      expect(typeof updateCall.data.durationMs).toBe("number")
    })

    it("does not leave the log in RUNNING state when syncGreenhouseBoard throws mid-loop", async () => {
      const board = { token: "acme", name: "Acme Corp", logoUrl: null, id: "b1", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() }
      mockGetActiveBoards.mockResolvedValue([board])
      mockDb.syncBoardResult.create.mockResolvedValue({})
      mockSyncGreenhouseBoard.mockRejectedValue(new Error("network error"))

      const result = await runSync("cron")

      // Should complete as FAILURE (all boards failed, none synced)
      expect(result.status).toBe("FAILURE")
      expect(result.boardsFailed).toBe(1)
      expect(result.boardsSynced).toBe(0)
      // syncLog.update should have been called with terminal status
      expect(mockDb.syncLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILURE" }),
        })
      )
    })
  })

  describe("success path", () => {
    it("returns SUCCESS when all boards sync cleanly", async () => {
      const board = { token: "acme", name: "Acme Corp", logoUrl: null, id: "b1", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() }
      mockGetActiveBoards.mockResolvedValue([board])
      mockSyncGreenhouseBoard.mockResolvedValue({
        jobsAdded: 5,
        jobsUpdated: 2,
        jobsDeactivated: 1,
        applicationsUpdated: 0,
        errors: [],
      })
      mockDb.syncBoardResult.create.mockResolvedValue({})

      const result = await runSync("cron")

      expect(result.status).toBe("SUCCESS")
      expect(result.boardsSynced).toBe(1)
      expect(result.boardsFailed).toBe(0)
      expect(result.totalAdded).toBe(5)
    })

    it("returns PARTIAL_FAILURE when some boards succeed and some fail", async () => {
      const boards = [
        { token: "acme", name: "Acme Corp", logoUrl: null, id: "b1", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() },
        { token: "beta", name: "Beta Inc", logoUrl: null, id: "b2", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() },
      ]
      mockGetActiveBoards.mockResolvedValue(boards)
      mockSyncGreenhouseBoard
        .mockResolvedValueOnce({ jobsAdded: 1, jobsUpdated: 0, jobsDeactivated: 0, applicationsUpdated: 0, errors: [] })
        .mockRejectedValueOnce(new Error("beta failed"))
      mockDb.syncBoardResult.create.mockResolvedValue({})

      const result = await runSync("cron")

      expect(result.status).toBe("PARTIAL_FAILURE")
      expect(result.boardsSynced).toBe(1)
      expect(result.boardsFailed).toBe(1)
    })

    it("returns FAILURE when no boards sync cleanly and some fail", async () => {
      const board = { token: "acme", name: "Acme Corp", logoUrl: null, id: "b1", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() }
      mockGetActiveBoards.mockResolvedValue([board])
      mockSyncGreenhouseBoard.mockResolvedValue({
        jobsAdded: 0, jobsUpdated: 0, jobsDeactivated: 0, applicationsUpdated: 0,
        errors: ["fetch failed"],
      })
      mockDb.syncBoardResult.create.mockResolvedValue({})

      const result = await runSync("cron")

      expect(result.status).toBe("FAILURE")
    })
  })
})

describe("reconcileStaleRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 0 when no stale runs exist", async () => {
    mockDb.syncLog.findMany.mockResolvedValue([])
    const count = await reconcileStaleRuns()
    expect(count).toBe(0)
    expect(mockDb.syncLog.updateMany).not.toHaveBeenCalled()
  })

  it("marks stale RUNNING rows as FAILURE", async () => {
    mockDb.syncLog.findMany.mockResolvedValue([{ id: "stale-1" }, { id: "stale-2" }])
    mockDb.syncLog.updateMany.mockResolvedValue({ count: 2 })

    const count = await reconcileStaleRuns()

    expect(count).toBe(2)
    expect(mockDb.syncLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["stale-1", "stale-2"] } },
        data: expect.objectContaining({
          status: "FAILURE",
          completedAt: expect.any(Date),
          errorSummary: expect.stringContaining("reconciler"),
        }),
      })
    )
  })

  it("queries with the correct threshold cutoff", async () => {
    mockDb.syncLog.findMany.mockResolvedValue([])
    const before = new Date(Date.now() - 7200000) // 2h ago
    await reconcileStaleRuns(7200000) // 2h threshold

    const callArg = mockDb.syncLog.findMany.mock.calls[0][0]
    expect(callArg.where.status).toBe("RUNNING")
    // cutoff should be approximately 2 hours ago
    const cutoff: Date = callArg.where.startedAt.lt
    expect(cutoff.getTime()).toBeCloseTo(before.getTime(), -3) // within 1 second
  })
})

// ---------------------------------------------------------------------------
// acquireSyncLock
// ---------------------------------------------------------------------------

describe("acquireSyncLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns acquired: true and syncLogId when no RUNNING sync exists", async () => {
    setupLockAcquired()

    const result = await acquireSyncLock("admin:test")

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      // UUID v4 format
      expect(result.syncLogId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    }
  })

  it("returns acquired: false when a RUNNING sync blocks", async () => {
    setupLockRejected("blocker-id")

    const result = await acquireSyncLock("admin:test")

    expect(result).toEqual({
      acquired: false,
      runningSyncLogId: "blocker-id",
    })
  })

  it("calls reconcileStaleRuns before attempting lock", async () => {
    setupLockAcquired()

    await acquireSyncLock("admin:test")

    // findMany is called by reconcileStaleRuns, $executeRaw is the atomic INSERT
    const findManyOrder = mockDb.syncLog.findMany.mock.invocationCallOrder[0]
    const executeRawOrder = mockDb.$executeRaw.mock.invocationCallOrder[0]
    expect(findManyOrder).toBeLessThan(executeRawOrder)
  })

  it("atomic INSERT prevents race condition", async () => {
    setupLockAcquired()

    await acquireSyncLock("test")

    expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// executeSyncWork
// ---------------------------------------------------------------------------

describe("executeSyncWork", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.syncLog.update.mockResolvedValue({ status: "SUCCESS" })
  })

  it("fetches SyncLog by ID and runs boards", async () => {
    mockDb.syncLog.findUniqueOrThrow.mockResolvedValue({
      startedAt: new Date(),
    })
    const board = {
      token: "acme",
      name: "Acme Corp",
      logoUrl: null,
      id: "b1",
      isActive: true,
      website: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockGetActiveBoards.mockResolvedValue([board])
    mockSyncGreenhouseBoard.mockResolvedValue({
      jobsAdded: 3,
      jobsUpdated: 1,
      jobsDeactivated: 0,
      applicationsUpdated: 0,
      errors: [],
    })
    mockDb.syncBoardResult.create.mockResolvedValue({})

    const result = await executeSyncWork("test-id")

    expect(result.status).toBe("SUCCESS")
    expect(mockDb.syncLog.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "test-id" } }),
    )
  })

  it("writes FAILURE to SyncLog on fatal error and re-throws", async () => {
    mockDb.syncLog.findUniqueOrThrow.mockResolvedValue({
      startedAt: new Date(),
    })
    mockGetActiveBoards.mockRejectedValue(new Error("boom"))

    await expect(executeSyncWork("test-id")).rejects.toThrow("boom")

    expect(mockDb.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILURE" }),
      }),
    )
  })

  it("throws if syncLogId does not exist", async () => {
    mockDb.syncLog.findUniqueOrThrow.mockRejectedValue(
      new Error("No SyncLog found"),
    )

    await expect(executeSyncWork("nonexistent-id")).rejects.toThrow(
      "No SyncLog found",
    )
  })
})

// ---------------------------------------------------------------------------
// getStaleThresholdMs
// ---------------------------------------------------------------------------

describe("getStaleThresholdMs", () => {
  const originalEnv = process.env.SYNC_STALE_THRESHOLD_MS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SYNC_STALE_THRESHOLD_MS
    } else {
      process.env.SYNC_STALE_THRESHOLD_MS = originalEnv
    }
  })

  it("returns default when env not set", () => {
    delete process.env.SYNC_STALE_THRESHOLD_MS
    expect(getStaleThresholdMs()).toBe(14_400_000) // 4h
  })

  it("reads SYNC_STALE_THRESHOLD_MS from env", () => {
    process.env.SYNC_STALE_THRESHOLD_MS = "7200000"
    expect(getStaleThresholdMs()).toBe(7_200_000)
  })

  it("falls back to default for invalid env values", () => {
    process.env.SYNC_STALE_THRESHOLD_MS = "garbage"
    expect(getStaleThresholdMs()).toBe(14_400_000)

    process.env.SYNC_STALE_THRESHOLD_MS = "0"
    expect(getStaleThresholdMs()).toBe(14_400_000)

    process.env.SYNC_STALE_THRESHOLD_MS = "-1"
    expect(getStaleThresholdMs()).toBe(14_400_000)
  })
})

// ---------------------------------------------------------------------------
// reconcileStaleRuns - env integration
// ---------------------------------------------------------------------------

describe("reconcileStaleRuns - env integration", () => {
  const originalEnv = process.env.SYNC_STALE_THRESHOLD_MS

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SYNC_STALE_THRESHOLD_MS
    } else {
      process.env.SYNC_STALE_THRESHOLD_MS = originalEnv
    }
  })

  it("uses env-based threshold by default", async () => {
    process.env.SYNC_STALE_THRESHOLD_MS = "3600000" // 1h
    mockDb.syncLog.findMany.mockResolvedValue([])

    await reconcileStaleRuns() // no explicit threshold arg

    const callArg = mockDb.syncLog.findMany.mock.calls[0][0]
    const cutoff: Date = callArg.where.startedAt.lt
    const expectedCutoff = new Date(Date.now() - 3_600_000)
    // within 1 second tolerance
    expect(cutoff.getTime()).toBeCloseTo(expectedCutoff.getTime(), -3)
  })
})

// ---------------------------------------------------------------------------
// duplicate triggers
// ---------------------------------------------------------------------------

describe("duplicate triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("second trigger while first is RUNNING returns already-running error", async () => {
    // First call succeeds
    setupLockAcquired()
    mockDb.syncLog.update.mockResolvedValue({ status: "SUCCESS" })
    mockGetActiveBoards.mockResolvedValue([])
    await runSync("cron")

    // Second call: lock rejected
    mockDb.syncLog.findMany.mockResolvedValue([]) // reconcile finds nothing
    mockDb.$executeRaw.mockResolvedValue(0) // atomic INSERT fails
    mockDb.syncLog.findFirst.mockResolvedValue({ id: "first-run-id" })

    await expect(runSync("cron")).rejects.toThrow(SyncAlreadyRunningError)
  })
})
