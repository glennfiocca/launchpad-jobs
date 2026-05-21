import { describe, it, expect } from "vitest";

import { extractRequiredLanguages } from "../language-extractor";

describe("extractRequiredLanguages", () => {
  it("returns spanish for 'Must speak Spanish'", () => {
    expect(extractRequiredLanguages("Must speak Spanish")).toEqual(["spanish"]);
  });

  it("returns mandarin for 'Fluent in Mandarin required'", () => {
    expect(extractRequiredLanguages("Fluent in Mandarin required")).toEqual([
      "mandarin",
    ]);
  });

  it("returns empty for 'Spanish preferred'", () => {
    expect(extractRequiredLanguages("Spanish preferred")).toEqual([]);
  });

  it("returns both languages for 'Bilingual French/English'", () => {
    expect(extractRequiredLanguages("Bilingual French/English")).toEqual([
      "english",
      "french",
    ]);
  });

  it("preference wins over requirement for 'Spanish speakers preferred but not required'", () => {
    expect(
      extractRequiredLanguages("Spanish speakers preferred but not required"),
    ).toEqual([]);
  });

  it("returns german for 'Required: must communicate in German'", () => {
    expect(
      extractRequiredLanguages("Required: must communicate in German"),
    ).toEqual(["german"]);
  });

  it("returns empty when 'not required' is in proximity window", () => {
    expect(
      extractRequiredLanguages(
        "We're hiring for our Spanish team — Spanish proficiency not required",
      ),
    ).toEqual([]);
  });

  it("returns empty when no requirement word is in the proximity window", () => {
    expect(
      extractRequiredLanguages("Spanish translation team is great to work with"),
    ).toEqual([]);
  });

  it("deduplicates and sorts results", () => {
    const content = "Must speak Spanish. Fluent in French. Required: Spanish.";
    expect(extractRequiredLanguages(content)).toEqual(["french", "spanish"]);
  });

  it("returns empty for empty input", () => {
    expect(extractRequiredLanguages("")).toEqual([]);
  });

  it("ignores partial word matches like 'polish' in 'polishing'", () => {
    expect(
      extractRequiredLanguages("Must be polishing our codebase constantly"),
    ).toEqual([]);
  });
});
