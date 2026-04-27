import { describe, it, expect } from "vitest"
import {
  buildSankeyFromApplications,
  buildDemoSankeyData,
  type SankeyGraphData,
} from "../sankey"
import type { ApplicationStatus } from "@prisma/client"

// Helper to create a test application
function app(
  status: ApplicationStatus,
  history: Array<{ fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus }> = [],
) {
  return { status, statusHistory: history }
}

describe("buildSankeyFromApplications", () => {
  it("returns empty graph for no applications", () => {
    const result = buildSankeyFromApplications([])
    expect(result).toEqual({
      nodes: [],
      links: [],
      totalApplications: 0,
    })
  })

  it("handles a single applied application", () => {
    const result = buildSankeyFromApplications([app("APPLIED")])
    expect(result.totalApplications).toBe(1)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe("APPLIED")
    expect(result.nodes[0].count).toBe(1)
    expect(result.links).toHaveLength(0)
  })

  it("builds forward flow from applications at different stages", () => {
    const result = buildSankeyFromApplications([
      app("APPLIED"),
      app("REVIEWING"),
      app("INTERVIEWING"),
    ])
    expect(result.totalApplications).toBe(3)

    // All 3 passed through APPLIED
    const applied = result.nodes.find((n) => n.id === "APPLIED")
    expect(applied?.count).toBe(3)

    // 2 passed through REVIEWING (REVIEWING + INTERVIEWING)
    const reviewing = result.nodes.find((n) => n.id === "REVIEWING")
    expect(reviewing?.count).toBe(2)

    // Forward links should exist
    const appliedToReviewing = result.links.find(
      (l) => l.source === "APPLIED" && l.target === "REVIEWING",
    )
    expect(appliedToReviewing?.value).toBe(2)
  })

  it("creates exit links for rejected applications", () => {
    const result = buildSankeyFromApplications([
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "REJECTED" },
      ]),
    ])

    // Should have APPLIED, REVIEWING nodes and REJECTED terminal
    expect(result.nodes.find((n) => n.id === "REJECTED")).toBeDefined()

    // Exit link from REVIEWING → REJECTED
    const exitLink = result.links.find(
      (l) => l.source === "REVIEWING" && l.target === "REJECTED",
    )
    expect(exitLink?.value).toBe(1)
  })

  it("handles applications that skip stages (APPLIED → REJECTED directly)", () => {
    const result = buildSankeyFromApplications([
      app("REJECTED"), // no history, rejected from APPLIED
    ])

    expect(result.totalApplications).toBe(1)

    const exitLink = result.links.find(
      (l) => l.source === "APPLIED" && l.target === "REJECTED",
    )
    expect(exitLink?.value).toBe(1)
  })

  it("uses statusHistory to determine highest stage reached", () => {
    // Application is rejected but went through PHONE_SCREEN
    const result = buildSankeyFromApplications([
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "REJECTED" },
      ]),
    ])

    // Should exit from PHONE_SCREEN, not APPLIED
    const exitFromScreen = result.links.find(
      (l) => l.source === "PHONE_SCREEN" && l.target === "REJECTED",
    )
    expect(exitFromScreen?.value).toBe(1)

    // Should NOT have an exit from APPLIED → REJECTED
    const exitFromApplied = result.links.find(
      (l) => l.source === "APPLIED" && l.target === "REJECTED",
    )
    expect(exitFromApplied).toBeUndefined()
  })

  it("handles withdrawn applications", () => {
    const result = buildSankeyFromApplications([
      app("WITHDRAWN", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "WITHDRAWN" },
      ]),
    ])

    expect(result.nodes.find((n) => n.id === "WITHDRAWN")).toBeDefined()
    const exitLink = result.links.find(
      (l) => l.source === "APPLIED" && l.target === "WITHDRAWN",
    )
    expect(exitLink?.value).toBe(1)
  })

  it("builds a complete funnel with multiple applications", () => {
    const result = buildSankeyFromApplications([
      app("OFFER", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "INTERVIEWING" },
        { fromStatus: "INTERVIEWING", toStatus: "OFFER" },
      ]),
      app("INTERVIEWING", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "PHONE_SCREEN" },
        { fromStatus: "PHONE_SCREEN", toStatus: "INTERVIEWING" },
      ]),
      app("REJECTED", [
        { fromStatus: null, toStatus: "APPLIED" },
        { fromStatus: "APPLIED", toStatus: "REVIEWING" },
        { fromStatus: "REVIEWING", toStatus: "REJECTED" },
      ]),
      app("APPLIED"),
    ])

    expect(result.totalApplications).toBe(4)

    // All 4 pass through APPLIED
    expect(result.nodes.find((n) => n.id === "APPLIED")?.count).toBe(4)
    // 3 pass through REVIEWING
    expect(result.nodes.find((n) => n.id === "REVIEWING")?.count).toBe(3)
    // 2 pass through PHONE_SCREEN
    expect(result.nodes.find((n) => n.id === "PHONE_SCREEN")?.count).toBe(2)
    // 2 pass through INTERVIEWING
    expect(result.nodes.find((n) => n.id === "INTERVIEWING")?.count).toBe(2)
    // 1 reaches OFFER
    expect(result.nodes.find((n) => n.id === "OFFER")?.count).toBe(1)
    // 1 rejected
    expect(result.nodes.find((n) => n.id === "REJECTED")?.count).toBe(1)
  })

  it("assigns correct colors from STATUS_CONFIG", () => {
    const result = buildSankeyFromApplications([app("APPLIED")])
    const node = result.nodes.find((n) => n.id === "APPLIED")
    expect(node?.color).toBe("#3b82f6") // blue-500
  })
})

describe("buildDemoSankeyData", () => {
  it("returns valid graph data", () => {
    const result = buildDemoSankeyData()
    expect(result.totalApplications).toBe(48)
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.links.length).toBeGreaterThan(0)
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

  it("link values are consistent (forward + exit <= source count)", () => {
    const result = buildDemoSankeyData()
    for (const node of result.nodes) {
      const outgoing = result.links
        .filter((l) => l.source === node.id)
        .reduce((sum, l) => sum + l.value, 0)
      // Outgoing should not exceed the node count
      expect(outgoing).toBeLessThanOrEqual(node.count)
    }
  })
})
