import { describe, it, expect } from "vitest";
import {
  normalizeText,
  matchDemographicOption,
  DECLINE_PATTERNS,
  type DemographicOption,
} from "../demographic-matcher";

// --- normalizeText ---

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  Hello World  ")).toBe("hello world");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("foo   bar")).toBe("foo bar");
  });

  it("strips hyphens", () => {
    expect(normalizeText("Decline To Self-Identify")).toBe("decline to self identify");
  });

  it("strips periods and commas", () => {
    expect(normalizeText("Yes, I have a disability.")).toBe("yes i have a disability");
  });

  it("normalizes smart/curly apostrophes", () => {
    expect(normalizeText("I don\u2019t wish to answer")).toBe("i dont wish to answer");
  });

  it("strips straight apostrophes", () => {
    expect(normalizeText("I don't wish to answer")).toBe("i dont wish to answer");
  });
});

// --- matchDemographicOption ---

const genderOptions: DemographicOption[] = [
  { id: 101, label: "Male" },
  { id: 102, label: "Female" },
  { id: 103, label: "Decline To Self Identify" },
];

const veteranOptions: DemographicOption[] = [
  { id: 301, label: "I am not a protected veteran" },
  { id: 302, label: "I identify as one or more of the classifications of a protected veteran" },
  { id: 303, label: "I don\u2019t wish to answer" },
];

const disabilityOptions: DemographicOption[] = [
  { id: 401, label: "Yes, I have a disability, or have had one in the past" },
  { id: 402, label: "No, I do not have a disability and have not had one in the past" },
  { id: 403, label: "I do not want to answer" },
];

describe("matchDemographicOption", () => {
  it("returns explicit_exact for exact profile match", () => {
    const result = matchDemographicOption(genderOptions, "Female", "gender");
    expect(result).toEqual({
      optionId: 102,
      label: "Female",
      mode: "explicit_exact",
    });
  });

  it("returns explicit_exact case-insensitively", () => {
    const result = matchDemographicOption(genderOptions, "female", "gender");
    expect(result).toEqual({
      optionId: 102,
      label: "Female",
      mode: "explicit_exact",
    });
  });

  it("returns decline_fallback when profileValue is null", () => {
    const result = matchDemographicOption(genderOptions, null, "gender");
    expect(result).toEqual({
      optionId: 103,
      label: "Decline To Self Identify",
      mode: "decline_fallback",
    });
  });

  it("returns decline_fallback when profileValue is undefined", () => {
    const result = matchDemographicOption(genderOptions, undefined, "gender");
    expect(result.mode).toBe("decline_fallback");
  });

  it("returns decline_fallback when explicit value has no match", () => {
    const result = matchDemographicOption(genderOptions, "Non-binary", "gender");
    expect(result).toEqual({
      optionId: 103,
      label: "Decline To Self Identify",
      mode: "decline_fallback",
    });
  });

  it("returns no_match when no decline option exists", () => {
    const noDecline: DemographicOption[] = [
      { id: 1, label: "Male" },
      { id: 2, label: "Female" },
    ];
    const result = matchDemographicOption(noDecline, null, "gender");
    expect(result).toEqual({
      optionId: null,
      label: null,
      mode: "no_match",
    });
  });

  it("returns no_match with warning when multiple decline options exist", () => {
    const ambiguous: DemographicOption[] = [
      { id: 1, label: "Male" },
      { id: 2, label: "Prefer not to say" },
      { id: 3, label: "Decline To Self Identify" },
    ];
    const result = matchDemographicOption(ambiguous, null, "gender");
    expect(result.mode).toBe("no_match");
    expect(result.warning).toContain("Multiple decline options");
    expect(result.warning).toContain("gender");
  });

  // Decline wording variants
  it.each([
    ["Decline To Self-Identify", "decline to self identify"],
    ["I don\u2019t wish to answer", "i dont wish to answer"],
    ["I don't wish to answer", "i dont wish to answer"],
    ["I do not want to answer", "i do not want to answer"],
    ["Choose not to answer", "choose not to answer"],
    ["Prefer not to say", "prefer not to say"],
    ["Prefer not to answer", "prefer not to answer"],
    ["Choose not to disclose", "choose not to disclose"],
  ])("recognizes decline wording: %s", (label) => {
    const opts: DemographicOption[] = [
      { id: 1, label: "Some option" },
      { id: 2, label },
    ];
    const result = matchDemographicOption(opts, null, "test");
    expect(result.mode).toBe("decline_fallback");
    expect(result.optionId).toBe(2);
  });

  // Safety: substantive answers never treated as decline
  it.each([
    "Male",
    "Female",
    "White",
    "Asian",
    "Black or African American",
    "Hispanic or Latino",
    "Yes, I have a disability, or have had one in the past",
    "I am not a protected veteran",
  ])("does not treat '%s' as a decline option", (label) => {
    expect(DECLINE_PATTERNS.includes(normalizeText(label))).toBe(false);
  });

  // Regression: explicit value still wins over decline fallback
  it("prefers explicit match over decline fallback", () => {
    const result = matchDemographicOption(genderOptions, "Male", "gender");
    expect(result.mode).toBe("explicit_exact");
    expect(result.optionId).toBe(101);
  });

  // Veteran with smart quotes
  it("matches veteran decline with smart quotes", () => {
    const result = matchDemographicOption(veteranOptions, null, "veteran");
    expect(result.mode).toBe("decline_fallback");
    expect(result.optionId).toBe(303);
  });

  // Disability decline
  it("matches disability decline option", () => {
    const result = matchDemographicOption(disabilityOptions, null, "disability");
    expect(result.mode).toBe("decline_fallback");
    expect(result.optionId).toBe(403);
  });
});
