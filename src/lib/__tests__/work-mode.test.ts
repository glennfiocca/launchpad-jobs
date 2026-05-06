import { describe, it, expect } from "vitest";
import {
  inferWorkModeFromJob,
  WORK_MODE_OPTIONS,
  WORK_MODE_LABELS,
  isWorkModeFilterEnabled,
} from "../work-mode";

describe("inferWorkModeFromJob", () => {
  describe("hybrid signals (most specific — checked first)", () => {
    it.each([
      ["NYC (SoHo) Hybrid", "hybrid"],
      ["Foster City, CA (Hybrid) M,W,F", "hybrid"],
      ["Hybrid - Bangalore, India", "hybrid"],
      ["London, UK (Hybrid)", "hybrid"],
    ])("location %j → %s", (location, slug) => {
      expect(inferWorkModeFromJob({ location })).toBe(slug);
    });

    it("title says Hybrid even if location doesn't", () => {
      expect(
        inferWorkModeFromJob({
          title: "Engineer (Hybrid)",
          location: "New York, NY",
        }),
      ).toBe("hybrid");
    });

    it("content mentions '3 days in office' → hybrid", () => {
      expect(
        inferWorkModeFromJob({
          title: "Software Engineer",
          location: "San Francisco, CA",
          content: "<p>This role requires 3 days in office per week.</p>",
        }),
      ).toBe("hybrid");
    });

    it("content mentions 'two days in the office' → hybrid (word number)", () => {
      expect(
        inferWorkModeFromJob({
          location: "Austin, TX",
          content: "We work two days in the office.",
        }),
      ).toBe("hybrid");
    });

    it("content mentions '4 days on-site' → hybrid", () => {
      expect(
        inferWorkModeFromJob({
          location: "Boston, MA",
          content: "Expectation: 4 days on-site weekly.",
        }),
      ).toBe("hybrid");
    });

    it("hybrid wins over remote signal in same location string", () => {
      // "Hybrid - Remote 3 days/week" — hybrid is the more specific call.
      expect(
        inferWorkModeFromJob({ location: "Hybrid - Remote 3 days/week" }),
      ).toBe("hybrid");
    });
  });

  describe("remote signals", () => {
    it.each([
      ["Remote", "remote"],
      ["Remote - US", "remote"],
      ["Remote - USA", "remote"],
      ["Remote, US", "remote"],
      ["Remote, NY", "remote"],
      ["United States (Remote)", "remote"],
      ["REMOTE", "remote"],
      ["  remote  ", "remote"],
    ])("location %j → %s", (location, slug) => {
      expect(inferWorkModeFromJob({ location })).toBe(slug);
    });

    it("empty location + remote=true → remote (legacy flag fallback)", () => {
      expect(inferWorkModeFromJob({ location: "", remote: true })).toBe("remote");
      expect(inferWorkModeFromJob({ location: null, remote: true })).toBe("remote");
    });

    it("empty location + remote=false → onsite", () => {
      expect(inferWorkModeFromJob({ location: "", remote: false })).toBe("onsite");
    });

    it("legacy flag is overridden when location says hybrid", () => {
      expect(
        inferWorkModeFromJob({ location: "NYC Hybrid", remote: true }),
      ).toBe("hybrid");
    });
  });

  describe("on-site (default)", () => {
    it.each([
      ["San Francisco", "onsite"],
      ["New York, NY", "onsite"],
      ["Boston, MA", "onsite"],
      ["London, UK", "onsite"],
    ])("location %j → %s", (location, slug) => {
      expect(inferWorkModeFromJob({ location })).toBe(slug);
    });

    it("'NY, Remote' → onsite (known mis-classification — Remote not at start, not in trailing parens)", () => {
      // Documented as a known false-negative. ~900 prod rows fall in this
      // bucket. Acceptable trade for not over-matching benign substrings.
      expect(inferWorkModeFromJob({ location: "NY, Remote" })).toBe("onsite");
    });

    it("empty input → onsite", () => {
      expect(inferWorkModeFromJob({})).toBe("onsite");
      expect(inferWorkModeFromJob({ location: "", title: "", content: "" })).toBe(
        "onsite",
      );
    });
  });

  describe("edge cases", () => {
    it("returns a slug from the canonical set for any input", () => {
      const result = inferWorkModeFromJob({
        title: "Random title",
        location: "Wherever",
      });
      expect(WORK_MODE_OPTIONS).toContain(result);
    });

    it("does not match 'hybrid' inside another word", () => {
      // \bhybrid\b — "hybridization" should not match.
      expect(
        inferWorkModeFromJob({
          title: "Hybridization Specialist",
          location: "Cambridge, MA",
        }),
      ).toBe("onsite");
    });

    it("does not match generic 'remote' substring inside other text", () => {
      // No location, no remote=true — body text alone shouldn't trigger remote.
      expect(
        inferWorkModeFromJob({
          location: "Seattle, WA",
          content: "We use remote desktops for security.",
        }),
      ).toBe("onsite");
    });

    it("'Remote-friendly position' in title alone does NOT classify as remote", () => {
      // Heuristic only checks location for remote — title-only "remote" is too
      // ambiguous (could mean a hybrid posting touting some remote flexibility).
      expect(
        inferWorkModeFromJob({
          title: "Remote-friendly Engineer",
          location: "Austin, TX",
        }),
      ).toBe("onsite");
    });

    it("WORK_MODE_LABELS covers every slug", () => {
      for (const slug of WORK_MODE_OPTIONS) {
        expect(WORK_MODE_LABELS[slug]).toBeTruthy();
      }
    });
  });
});

describe("isWorkModeFilterEnabled", () => {
  const ORIG = process.env.JOBS_WORK_MODE_FILTER;

  it("defaults to true when env var is unset", () => {
    delete process.env.JOBS_WORK_MODE_FILTER;
    expect(isWorkModeFilterEnabled()).toBe(true);
    process.env.JOBS_WORK_MODE_FILTER = ORIG;
  });

  it("returns false when env var is 'false'", () => {
    process.env.JOBS_WORK_MODE_FILTER = "false";
    expect(isWorkModeFilterEnabled()).toBe(false);
    process.env.JOBS_WORK_MODE_FILTER = ORIG;
  });

  it("returns false when env var is '0'", () => {
    process.env.JOBS_WORK_MODE_FILTER = "0";
    expect(isWorkModeFilterEnabled()).toBe(false);
    process.env.JOBS_WORK_MODE_FILTER = ORIG;
  });
});
