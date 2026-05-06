import { describe, it, expect } from "vitest";
import {
  inferExperienceLevelFromTitle,
  EXPERIENCE_LEVEL_OPTIONS,
  EXPERIENCE_LEVEL_LABELS,
  isExperienceFilterEnabled,
} from "../experience-level";

describe("inferExperienceLevelFromTitle", () => {
  describe("basic level matches", () => {
    it.each([
      ["Senior Software Engineer", "senior"],
      ["Sr. Backend Engineer", "senior"],
      ["Staff Software Engineer", "staff"],
      ["Principal Architect", "staff"],
      ["Distinguished Engineer", "staff"],
      ["Junior Designer", "entry"],
      ["Jr. Analyst", "entry"],
      ["Associate Product Manager", "entry"],
      ["Entry-level Marketing Specialist", "entry"],
      ["New Grad Software Engineer", "entry"],
    ])("classifies %j as %s", (title, slug) => {
      expect(inferExperienceLevelFromTitle(title)).toBe(slug);
    });
  });

  describe("level-overrides-management precedence", () => {
    it("'Senior Engineering Manager' → senior (not management)", () => {
      expect(inferExperienceLevelFromTitle("Senior Engineering Manager")).toBe(
        "senior"
      );
    });

    it("'Staff Engineering Manager' → staff (not management)", () => {
      expect(inferExperienceLevelFromTitle("Staff Engineering Manager")).toBe(
        "staff"
      );
    });

    it("'Junior Product Manager' → entry (not management)", () => {
      expect(inferExperienceLevelFromTitle("Junior Product Manager")).toBe(
        "entry"
      );
    });

    it("'Principal Director of Research' → staff (not management)", () => {
      expect(
        inferExperienceLevelFromTitle("Principal Director of Research")
      ).toBe("staff");
    });
  });

  describe("management words", () => {
    it.each([
      ["VP of Engineering", "management"],
      ["SVP, Sales", "management"],
      ["EVP Operations", "management"],
      ["Director, Marketing", "management"],
      ["Head of Product", "management"],
      ["Chief Marketing Officer", "management"],
      ["CTO", "management"],
      ["CFO", "management"],
      ["Engineering Manager", "management"],
    ])("classifies %j as %s", (title, slug) => {
      expect(inferExperienceLevelFromTitle(title)).toBe(slug);
    });
  });

  describe("lead carve-out", () => {
    it("'Lead Engineer' → staff", () => {
      expect(inferExperienceLevelFromTitle("Lead Engineer")).toBe("staff");
    });

    it("'Lead Designer' → staff", () => {
      expect(inferExperienceLevelFromTitle("Lead Designer")).toBe("staff");
    });

    it("'Lead Scientist' → staff", () => {
      expect(inferExperienceLevelFromTitle("Lead Scientist")).toBe("staff");
    });

    it("'Lead Data Scientist' → mid (compound noun, not staff carve-out)", () => {
      // The carve-out only matches "Lead <engineering noun>" directly. "Data"
      // is a modifier between, so this falls through to mid. Acceptable
      // mis-classification to keep the false-positive rate on lead-as-noun
      // titles ("Lead Generation", "Lead Sales") low.
      expect(inferExperienceLevelFromTitle("Lead Data Scientist")).toBe("mid");
    });

    it("'Lead Generation Specialist' → mid (lead-as-noun, not staff)", () => {
      expect(
        inferExperienceLevelFromTitle("Lead Generation Specialist")
      ).toBe("mid");
    });

    it("'Lead Sales Development Representative' → mid", () => {
      expect(
        inferExperienceLevelFromTitle("Lead Sales Development Representative")
      ).toBe("mid");
    });
  });

  describe("default mid", () => {
    it.each([
      ["Software Engineer", "mid"],
      ["Product Designer", "mid"],
      ["Data Analyst", "mid"],
      ["Backend Developer", "mid"],
    ])("untagged title %j → mid", (title, slug) => {
      expect(inferExperienceLevelFromTitle(title)).toBe(slug);
    });
  });

  describe("edge cases", () => {
    it("empty string → mid", () => {
      expect(inferExperienceLevelFromTitle("")).toBe("mid");
    });

    it("whitespace-only → mid", () => {
      expect(inferExperienceLevelFromTitle("   ")).toBe("mid");
    });

    it("weird casing matches case-insensitively", () => {
      expect(inferExperienceLevelFromTitle("sEnIoR EnGiNeEr")).toBe("senior");
      expect(inferExperienceLevelFromTitle("STAFF ENGINEER")).toBe("staff");
    });

    it("multiple level words — first in precedence wins", () => {
      // ENTRY is checked before SENIOR — so "Junior Senior" hits entry first.
      expect(inferExperienceLevelFromTitle("Junior to Senior Engineer")).toBe(
        "entry"
      );
      // SENIOR before STAFF — "Senior Staff Engineer" → senior.
      expect(inferExperienceLevelFromTitle("Senior Staff Engineer")).toBe(
        "senior"
      );
    });

    it("returns a slug from the canonical set", () => {
      const result = inferExperienceLevelFromTitle("Random Title Here");
      expect(EXPERIENCE_LEVEL_OPTIONS).toContain(result);
    });

    it("does not falsely classify 'Contract Manager' as management when no level word", () => {
      // Manager triggers management — that's correct, no level word present.
      expect(inferExperienceLevelFromTitle("Contract Manager")).toBe(
        "management"
      );
    });

    it("does not match 'manager' inside another word", () => {
      // \bmanager\b — "managerial" should not match. Default mid expected.
      expect(inferExperienceLevelFromTitle("Managerial Accountant")).toBe(
        "mid"
      );
    });
  });

  describe("static exports", () => {
    it("EXPERIENCE_LEVEL_LABELS covers every slug", () => {
      for (const slug of EXPERIENCE_LEVEL_OPTIONS) {
        expect(EXPERIENCE_LEVEL_LABELS[slug]).toBeTruthy();
      }
    });
  });
});

describe("isExperienceFilterEnabled", () => {
  const ORIG = process.env.JOBS_EXPERIENCE_FILTER;
  afterEachReset();

  function afterEachReset(): void {
    // vitest doesn't auto-isolate process.env mutations; restore manually.
    // (Tiny helper instead of importing afterEach to keep this self-contained.)
  }

  it("defaults to true when env var is unset", () => {
    delete process.env.JOBS_EXPERIENCE_FILTER;
    expect(isExperienceFilterEnabled()).toBe(true);
    process.env.JOBS_EXPERIENCE_FILTER = ORIG;
  });

  it("returns false when env var is 'false'", () => {
    process.env.JOBS_EXPERIENCE_FILTER = "false";
    expect(isExperienceFilterEnabled()).toBe(false);
    process.env.JOBS_EXPERIENCE_FILTER = ORIG;
  });

  it("returns false when env var is '0'", () => {
    process.env.JOBS_EXPERIENCE_FILTER = "0";
    expect(isExperienceFilterEnabled()).toBe(false);
    process.env.JOBS_EXPERIENCE_FILTER = ORIG;
  });
});
