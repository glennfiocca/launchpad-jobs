import { describe, it, expect, vi, beforeEach } from "vitest"
import { runSync, reconcileStaleRuns, SyncAlreadyRunningError } from "../sync-runner"

// --- Mocks ---

vi.mock("@/lib/db", () => ({
  db: {
    syncLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    syncBoardResult: {
      create: vi.fn(),
    },
  },
}))

vi.mock("@/lib/greenhouse", () => ({
  getActiveBoards: vi.fn(),
  syncGreenhouseBoard: vi.fn(),
}))

// Helper to get typed mock references after import
import { db } from "@/lib/db"
import { getActiveBoards, syncGreenhouseBoard } from "@/lib/greenhouse"

const mockDb = db as {
  syncLog: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  syncBoardResult: {
    create: ReturnType<typeof vi.fn>
  }
}
const mockGetActiveBoards = getActiveBoards as ReturnType<typeof vi.fn>
const mockSyncGreenhouseBoard = syncGreenhouseBoard as ReturnType<typeof vi.fn>

// --- Test helpers ---

function makeSyncLog(overrides: Partial<{ id: string; status: string }> = {}) {
  return { id: "log-1", status: "RUNNING", startedAt: new Date(), ...overrides }
}

// --- Tests ---

describe("runSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no existing RUNNING run
    mockDb.syncLog.findFirst.mockResolvedValue(null)
    // Default: create returns a log row
    mockDb.syncLog.create.mockResolvedValue(makeSyncLog())
    // Default: update succeeds
    mockDb.syncLog.update.mockResolvedValue(makeSyncLog({ status: "SUCCESS" }))
    // Default: no boards
    mockGetActiveBoards.mockResolvedValue([])
  })

  describe("concurrency guard", () => {
    it("throws SyncAlreadyRunningError when a RUNNING log exists", async () => {
      mockDb.syncLog.findFirst.mockResolvedValue({ id: "existing-log-id" })

      await expect(runSync("cron")).rejects.toThrow(SyncAlreadyRunningError)
      await expect(runSync("cron")).rejects.toThrow("Sync already running (syncLogId: existing-log-id)")
      // No DB write should have occurred
      expect(mockDb.syncLog.create).not.toHaveBeenCalled()
    })

    it("exposes runningSyncLogId on the error", async () => {
      mockDb.syncLog.findFirst.mockResolvedValue({ id: "existing-log-id" })

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
      mockDb.syncLog.create.mockResolvedValue(makeSyncLog({ id: "log-fatal" }))
      mockGetActiveBoards.mockRejectedValue(new Error("DB connection lost"))

      await expect(runSync("cron")).rejects.toThrow("DB connection lost")

      expect(mockDb.syncLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "log-fatal" },
          data: expect.objectContaining({
            status: "FAILURE",
            errorSummary: expect.stringContaining("Fatal error: DB connection lost"),
          }),
        })
      )
    })

    it("sets completedAt on the FAILURE update", async () => {
      mockDb.syncLog.create.mockResolvedValue(makeSyncLog({ id: "log-fatal" }))
      mockGetActiveBoards.mockRejectedValue(new Error("timeout"))

      await expect(runSync("cron")).rejects.toThrow()

      const updateCall = mockDb.syncLog.update.mock.calls[0][0]
      expect(updateCall.data.completedAt).toBeInstanceOf(Date)
      expect(typeof updateCall.data.durationMs).toBe("number")
    })

    it("does not leave the log in RUNNING state when syncGreenhouseBoard throws mid-loop", async () => {
      const board = { token: "acme", name: "Acme Corp", logoUrl: null, id: "b1", isActive: true, website: null, createdAt: new Date(), updatedAt: new Date() }
      mockGetActiveBoards.mockResolvedValue([board])
      // Board-level errors are caught inside the loop and recorded as board FAILURE.
      // The outer loop catch writes a SyncBoardResult and increments boardsFailed.
      // The outer SyncLog update should still be called with a terminal status.
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
