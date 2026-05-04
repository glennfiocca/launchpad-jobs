import { describe, it, expect } from "vitest";
import {
  buildRelevanceOrder,
  buildBlendedRelevanceOrder,
  hasProfileSignals,
} from "../job-relevance";
import type { RelevanceProfile } from "../job-relevance";

// Empty/default profile — no scoring signals.
const EMPTY_PROFILE: RelevanceProfile = {
  locationCity: null,
  locationState: null,
  openToRemote: false,
  openToOnsite: false,
  currentTitle: null,
  fieldOfStudy: null,
  desiredSalaryMin: null,
  desiredSalaryMax: null,
};

// Helper that overrides only the fields under test.
function profile(overrides: Partial<RelevanceProfile>): RelevanceProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("hasProfileSignals", () => {
  it("returns false for null", () => {
    expect(hasProfileSignals(null)).toBe(false);
  });

  it("returns false for an empty profile", () => {
    expect(hasProfileSignals(EMPTY_PROFILE)).toBe(false);
  });

  it("returns false when only currentTitle/fieldOfStudy are set", () => {
    // Regression guard: identity fields are no longer scoring signals
    // because their per-row ts_rank evaluation was the dominant cost.
    expect(
      hasProfileSignals(
        profile({ currentTitle: "Software Engineer", fieldOfStudy: "CS" })
      )
    ).toBe(false);
  });

  it("returns true when locationCity is set", () => {
    expect(hasProfileSignals(profile({ locationCity: "NYC" }))).toBe(true);
  });

  it("returns true when locationState is set", () => {
    expect(hasProfileSignals(profile({ locationState: "NY" }))).toBe(true);
  });

  it("returns true when openToRemote is true", () => {
    expect(hasProfileSignals(profile({ openToRemote: true }))).toBe(true);
  });

  it("returns true when openToOnsite is true", () => {
    expect(hasProfileSignals(profile({ openToOnsite: true }))).toBe(true);
  });

  it("returns true when desiredSalaryMin is set (including 0)", () => {
    expect(hasProfileSignals(profile({ desiredSalaryMin: 0 }))).toBe(true);
    expect(hasProfileSignals(profile({ desiredSalaryMin: 100000 }))).toBe(true);
  });

  it("returns true when desiredSalaryMax is set", () => {
    expect(hasProfileSignals(profile({ desiredSalaryMax: 200000 }))).toBe(true);
  });
});

describe("buildRelevanceOrder", () => {
  it("falls back to recency when profile has no signals", () => {
    const sql = buildRelevanceOrder(EMPTY_PROFILE).sql;
    expect(sql).toContain('"createdAt"');
    expect(sql).not.toContain("ts_rank");
    expect(sql).not.toContain("LIKE");
  });

  it("falls back to recency when only identity fields are set", () => {
    // currentTitle/fieldOfStudy alone no longer trigger profile scoring.
    const sql = buildRelevanceOrder(
      profile({ currentTitle: "Engineer", fieldOfStudy: "CS" })
    ).sql;
    expect(sql).toContain('"createdAt"');
    expect(sql).not.toContain("ts_rank");
  });

  it("includes city LIKE and excludes ts_rank when only city is set", () => {
    const order = buildRelevanceOrder(profile({ locationCity: "Austin" }));
    expect(order.sql).toContain("LIKE");
    expect(order.sql).not.toContain("ts_rank");
    // Value is bound as a parameter (with leading/trailing %).
    expect(order.values).toContain("%Austin%");
  });

  it("does NOT contain ts_rank or identity fields even with full profile (B1 regression guard)", () => {
    const fullProfile = profile({
      locationCity: "Austin",
      locationState: "TX",
      openToRemote: true,
      openToOnsite: false,
      currentTitle: "Senior Software Engineer",
      fieldOfStudy: "Computer Science",
      desiredSalaryMin: 120000,
      desiredSalaryMax: 200000,
    });
    const order = buildRelevanceOrder(fullProfile);
    // Bug B1: per-row ts_rank against currentTitle+fieldOfStudy was dropped.
    expect(order.sql).not.toContain("ts_rank");
    // Identity strings must not appear as bound values either.
    expect(order.values).not.toContain("Senior Software Engineer");
    expect(order.values).not.toContain("Computer Science");
    expect(order.values).not.toContain("Senior Software Engineer Computer Science");
    // Structural signals are still present.
    expect(order.sql).toContain("LIKE");
    expect(order.sql).toContain("remote");
    expect(order.sql).toContain('"salaryMax"');
    expect(order.sql).toContain('"salaryMin"');
  });
});

describe("buildBlendedRelevanceOrder", () => {
  it("preserves ts_rank * 30 for the FTS path with full profile", () => {
    const fullProfile = profile({
      locationCity: "NYC",
      locationState: "NY",
      currentTitle: "Engineer",
      fieldOfStudy: "CS",
      desiredSalaryMin: 100000,
    });
    const order = buildBlendedRelevanceOrder("react developer", fullProfile);
    // FTS rank is legitimate here — uses the user's real query.
    expect(order.sql).toContain("ts_rank");
    expect(order.sql).toContain("* 30");
    // Profile structural signals should still be appended.
    expect(order.sql).toContain("LIKE");
    // The identity-derived ts_rank * 40 fragment must NOT be present.
    expect(order.sql).not.toContain("* 40");
    // The user's query is bound as a parameter.
    expect(order.values).toContain("react developer");
  });

  it("does not bind currentTitle/fieldOfStudy as ts_rank input", () => {
    const fullProfile = profile({
      currentTitle: "Senior Engineer",
      fieldOfStudy: "Computer Science",
    });
    const order = buildBlendedRelevanceOrder("python", fullProfile);
    expect(order.values).not.toContain("Senior Engineer");
    expect(order.values).not.toContain("Computer Science");
    expect(order.values).not.toContain("Senior Engineer Computer Science");
  });
});
