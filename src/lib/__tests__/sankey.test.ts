import { describe, it, expect } from "vitest"
import {
  buildSankeyFromApplications,
  buildDemoSankeyData,
  type SankeyApplicationInput,
} from "../sankey"
import type { ApplicationStatus } from "@prisma/client"

// Helper to create a test application. Defaults to an active job; pass
// `isActive: false` to simulate a job removed from the source board.
function app(
  status: ApplicationStatus,
  history: Array<{ fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus }> = [],
  options: { jobIsActive?: boolean } = {},
): SankeyApplicationInput {
  return {
    status,
    statusHistory: history,
    job: { isActive: options.jobIsActive ?? true },
  }
}

describe("buildSankeyFromApplications", () => {
  it("returns all forward stages with zero counts when no applications", () => {
    const result = buildSankeyFromApplications([])
    expect(result.totalApplications).toBe(0)
    expect(result.links).toEqual([])
    // Always emit the 5 forward stages so downstream renderers stay stable.
    expect(result.nodes.map((n) => n.id)).toEqual([
      "APPLIED",
      "REVIEWING",
      "PHONE_SCREEN",
      "INTERVIEWING",
      "OFFER",
    ])
    for (const n of result.nodes) {
      expect(n.count).toBe(0)
    }
    // Empty closure map is still keyed by every forward stage.
    expect(result.closedAtStage).toEqual({
      APPLIED: 0,
      REVIEWING: 0,
      PHONE_SCREEN: 0,
      INTERVIEWING: 0,
      OFFER: 0,
    })
  })

  it("counts an APPLIED app with an active job as in-flight at APPLIED", () => {
    const result = buildSankeyFromApplications([app("APPLIED")])
    expect(result.totalApplications).toBe(1)
    expect(result.nodes).toHaveLength(5)
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "REVIEWING")?.count).toBe(0)
    // No closures — the app is still active.
    expect(result.closedAtStage.APPLIED).toBe(0)
    expect(result.links).toHaveLength(0)
  })

  it("counts an APPLIED app with an inactive job as a closure at APPLIED", () => {
    // Job was removed from the source board — even though status is still
    // APPLIED, the app counts as closed in the manifold.
    const result = buildSankeyFromApplications([
      app("APPLIED", [], { jobIsActive: false }),
    ])
    expect(result.totalApplications).toBe(1)
    // No in-flight count — the app is closed.
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(0)
    // Drop-off attributed to APPLIED.
    expect(result.closedAtStage.APPLIED).toBe(1)
    expect(result.closedAtStage.REVIEWING).toBe(0)
  })

  it("counts in-flight apps at their CURRENT stage, not cumulatively", () => {
    const result = buildSankeyFromApplications([
      app("APPLIED"),
      app("REVIEWING"),
      app("INTERVIEWING"),
    ])
    expect(result.totalApplications).toBe(3)
    // Each app is in-flight at exactly its current stage — no cumulative
    // "passed through" counting here.
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "REVIEWING")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "PHONE_SCREEN")?.count).toBe(0)
    expect(result.nodes.find((n) => n.id === "INTERVIEWING")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "OFFER")?.count).toBe(0)

    // No closures — all three are still active.
    for (const stage of [
      "APPLIED",
      "REVIEWING",
      "PHONE_SCREEN",
      "INTERVIEWING",
      "OFFER",
    ] as const) {
      expect(result.closedAtStage[stage]).toBe(0)
    }
  })

  it("attributes a REJECTED app to the highest stage it reached", () => {
    const result = buildSankeyFromApplications([
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "REJECTED" },
      ]),
    ])

    // Closure attributed to REVIEWING (the highest forward stage reached).
    expect(result.closedAtStage.REVIEWING).toBe(1)
    expect(result.closedAtStage.APPLIED).toBe(0)

    // Terminal REJECTED node carries the same count for legacy consumers.
    expect(result.nodes.find((n) => n.id === "REJECTED")?.count).toBe(1)

    // Exit link from REVIEWING → REJECTED.
    expect(
      result.links.find((l) => l.source === "REVIEWING" && l.target === "REJECTED")?.value,
    ).toBe(1)
  })

  it("attributes a REJECTED app with no history to APPLIED", () => {
    const result = buildSankeyFromApplications([app("REJECTED")])
    expect(result.totalApplications).toBe(1)
    expect(result.closedAtStage.APPLIED).toBe(1)
    expect(
      result.links.find((l) => l.source === "APPLIED" && l.target === "REJECTED")?.value,
    ).toBe(1)
  })

  it("uses statusHistory to determine highest stage reached for rejections", () => {
    const result = buildSankeyFromApplications([
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "REJECTED" },
      ]),
    ])

    expect(result.closedAtStage.PHONE_SCREEN).toBe(1)
    expect(result.closedAtStage.APPLIED).toBe(0)
    expect(result.closedAtStage.REVIEWING).toBe(0)
  })

  it("counts WITHDRAWN applications as closures at the highest reached stage", () => {
    // WITHDRAWN is user-initiated but still represents the application ending.
    // It contributes to the drop-off at the stage the app reached before
    // being withdrawn. See sankey.ts.
    const result = buildSankeyFromApplications([
      app("WITHDRAWN", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "WITHDRAWN" },
      ]),
      app("APPLIED"),
    ])

    expect(result.totalApplications).toBe(2)
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(1)
    // WITHDRAWN closure attributed to APPLIED (the highest forward stage reached).
    expect(result.closedAtStage.APPLIED).toBe(1)
    for (const stage of ["REVIEWING", "PHONE_SCREEN", "INTERVIEWING", "OFFER"] as const) {
      expect(result.closedAtStage[stage]).toBe(0)
    }
    // Terminal WITHDRAWN node retains its count for any caller that surfaces it.
    expect(result.nodes.find((n) => n.id === "WITHDRAWN")?.count).toBe(1)
  })

  it("treats job-removed applications as closures at the highest reached stage", () => {
    // App is currently at REVIEWING but the underlying job was removed
    // from the source board — counts as a closure at REVIEWING.
    const result = buildSankeyFromApplications([
      app(
        "REVIEWING",
        [
          { fromStatus: null, toStatus: "APPLIED" },
          { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        ],
        { jobIsActive: false },
      ),
    ])
    expect(result.closedAtStage.REVIEWING).toBe(1)
    expect(result.closedAtStage.APPLIED).toBe(0)
    // Not in-flight anywhere — the job is gone.
    expect(result.nodes.find((n) => n.id === "REVIEWING")?.count).toBe(0)
  })

  it("builds a mixed funnel correctly", () => {
    const result = buildSankeyFromApplications([
      // Reached OFFER, still in flight.
      app("OFFER", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "INTERVIEWING" },
        { fromStatus: "INTERVIEWING", toStatus: "OFFER" },
      ]),
      // Currently INTERVIEWING.
      app("INTERVIEWING", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "INTERVIEWING" },
      ]),
      // Rejected at REVIEWING.
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "REJECTED" },
      ]),
      // Still at APPLIED, active job.
      app("APPLIED"),
      // Withdrawn — invisible.
      app("WITHDRAWN", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "WITHDRAWN" },
      ]),
    ])

    expect(result.totalApplications).toBe(5)

    // In-flight counts (current stage, active job, not closed).
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "REVIEWING")?.count).toBe(0)
    expect(result.nodes.find((n) => n.id === "PHONE_SCREEN")?.count).toBe(0)
    expect(result.nodes.find((n) => n.id === "INTERVIEWING")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "OFFER")?.count).toBe(1)

    // Closures: REJECTED at REVIEWING + WITHDRAWN at APPLIED.
    expect(result.closedAtStage.APPLIED).toBe(1)
    expect(result.closedAtStage.REVIEWING).toBe(1)
    expect(result.closedAtStage.PHONE_SCREEN).toBe(0)
    expect(result.closedAtStage.INTERVIEWING).toBe(0)
    expect(result.closedAtStage.OFFER).toBe(0)

    // Terminal nodes have their counts.
    expect(result.nodes.find((n) => n.id === "REJECTED")?.count).toBe(1)
    expect(result.nodes.find((n) => n.id === "WITHDRAWN")?.count).toBe(1)
  })

  it("assigns correct colors from STATUS_CONFIG", () => {
    const result = buildSankeyFromApplications([app("APPLIED")])
    const node = result.nodes.find((n) => n.id === "APPLIED")
    expect(node?.color).toBe("#3b82f6") // blue-500
  })
})

describe("buildDemoSankeyData", () => {
  it("returns valid graph data with closure map", () => {
    const result = buildDemoSankeyData()
    expect(result.totalApplications).toBe(48)
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.links.length).toBeGreaterThan(0)
    // Demo data must populate closedAtStage so the renderer can size
    // drop-off shapes for anonymous visitors.
    expect(result.closedAtStage.APPLIED).toBeGreaterThan(0)
  })

  it("has all forward flow links", () => {
    const result = buildDemoSankeyData()
    const forwardLinks = result.links.filter(
      (l) =>
        (l.source === "APPLIED" && l.target === "REVIEWING") ||
        (l.source === "REVIEWING" && l.target === "PHONE_SCREEN") ||
        (l.source === "PHONE_SCREEN" && l.target === "INTERVIEWING") ||
        (l.source === "INTERVIEWING" && l.target === "OFFER"),
    )
    expect(forwardLinks).toHaveLength(4)
  })

  it("has rejection exit links", () => {
    const result = buildDemoSankeyData()
    const rejectionLinks = result.links.filter((l) => l.target === "REJECTED")
    expect(rejectionLinks.length).toBeGreaterThan(0)
  })
})
