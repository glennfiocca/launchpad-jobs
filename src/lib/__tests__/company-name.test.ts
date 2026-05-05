import { describe, it, expect } from "vitest";
import {
  resolveCompanyName,
  lookupOverride,
  looksMalformed,
  smartTitleCase,
  stripCorporateSuffix,
  normalizeName,
} from "../company-name";

describe("smartTitleCase", () => {
  it("title-cases a simple lowercase word", () => {
    expect(smartTitleCase("anthropic")).toBe("Anthropic");
  });

  it("preserves the AI acronym in uppercase", () => {
    expect(smartTitleCase("scale ai")).toBe("Scale AI");
    expect(smartTitleCase("together ai")).toBe("Together AI");
  });

  it("preserves multi-word names with joiners lowercased", () => {
    expect(smartTitleCase("bank of america")).toBe("Bank of America");
  });

  it("does NOT lowercase a joiner at the start of the name", () => {
    expect(smartTitleCase("the new york times")).toBe("The New York Times");
  });

  it("handles hyphenated tokens and preserves separators", () => {
    expect(smartTitleCase("scale-ai")).toBe("Scale-AI");
  });

  it("collapses ALL CAPS input to title case", () => {
    expect(smartTitleCase("SCALE AI")).toBe("Scale AI");
  });

  it("returns empty string unchanged", () => {
    expect(smartTitleCase("")).toBe("");
  });
});

describe("looksMalformed", () => {
  it("flags all-lowercase names", () => {
    expect(looksMalformed("openai")).toBe(true);
    expect(looksMalformed("scale ai")).toBe(true);
  });

  it("flags ALL CAPS strings longer than 4 chars", () => {
    expect(looksMalformed("ANTHROPIC")).toBe(true);
  });

  it("does NOT flag short ALL CAPS (likely acronym)", () => {
    expect(looksMalformed("IBM")).toBe(false);
    expect(looksMalformed("EQT")).toBe(false);
  });

  it("does NOT flag well-cased names", () => {
    expect(looksMalformed("Anthropic")).toBe(false);
    expect(looksMalformed("OpenAI")).toBe(false);
    expect(looksMalformed("DoorDash")).toBe(false);
    expect(looksMalformed("1stDibs")).toBe(false);
  });

  it("flags hyphenated lowercase tokens", () => {
    expect(looksMalformed("scale-ai")).toBe(true);
  });

  it("flags empty / whitespace strings", () => {
    expect(looksMalformed("")).toBe(true);
    expect(looksMalformed("   ")).toBe(true);
  });
});

describe("stripCorporateSuffix", () => {
  it("removes a trailing Inc.", () => {
    expect(stripCorporateSuffix("Couchbase Inc.")).toBe("Couchbase");
    expect(stripCorporateSuffix("Couchbase, Inc")).toBe("Couchbase");
  });

  it("removes LLC, Ltd, Corp variants", () => {
    expect(stripCorporateSuffix("Foo LLC")).toBe("Foo");
    expect(stripCorporateSuffix("Foo Ltd.")).toBe("Foo");
    expect(stripCorporateSuffix("Foo Corp")).toBe("Foo");
    expect(stripCorporateSuffix("Foo Corporation")).toBe("Foo");
  });

  it("leaves names without a suffix unchanged", () => {
    expect(stripCorporateSuffix("Anthropic")).toBe("Anthropic");
  });
});

describe("normalizeName", () => {
  it("strips suffix and title-cases together", () => {
    expect(normalizeName("ACME LLC")).toBe("Acme");
  });
});

describe("lookupOverride", () => {
  it("hits the openai override", () => {
    expect(lookupOverride("GREENHOUSE", "openai")).toBe("OpenAI");
  });

  it("hits the astronomer / stronomer overrides", () => {
    expect(lookupOverride("GREENHOUSE", "astronomer")).toBe("Astronomer");
    expect(lookupOverride("GREENHOUSE", "stronomer")).toBe("Astronomer");
  });

  it("strips the ashby- prefix before lookup", () => {
    // SHARED_OVERRIDES applies cross-provider — "openai" hits regardless of ATS.
    expect(lookupOverride("ASHBY", "ashby-openai")).toBe("OpenAI");
    expect(lookupOverride("ASHBY", "ashby-langchain")).toBe("LangChain");
  });

  it("returns undefined for unknown slugs", () => {
    expect(lookupOverride("GREENHOUSE", "completely-unknown-co")).toBeUndefined();
  });
});

describe("resolveCompanyName", () => {
  it("returns override when slug is curated", () => {
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "openai",
      rawName: "openai",
    });
    expect(result).toEqual({ name: "OpenAI", source: "override" });
  });

  it("override beats a well-formed raw name", () => {
    // Even if Greenhouse returns "Open AI" (technically valid), we still
    // canonicalize to the brand's preferred "OpenAI".
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "openai",
      rawName: "Open AI",
    });
    expect(result.name).toBe("OpenAI");
    expect(result.source).toBe("override");
  });

  it("preserves a well-formed raw name when no override exists", () => {
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "newco",
      rawName: "Anthropic",
    });
    expect(result).toEqual({ name: "Anthropic", source: "raw" });
  });

  it("normalizes a malformed raw name", () => {
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "newco",
      rawName: "anthropic",
    });
    expect(result).toEqual({ name: "Anthropic", source: "normalized" });
  });

  it("falls back to slug when raw name is missing", () => {
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "newco",
      rawName: null,
    });
    expect(result).toEqual({ name: "Newco", source: "slug" });
  });

  it("handles the stronomer truncation via override", () => {
    const result = resolveCompanyName({
      provider: "GREENHOUSE",
      slug: "astronomer",
      rawName: "stronomer",
    });
    expect(result.name).toBe("Astronomer");
    expect(result.source).toBe("override");
  });

  it("strips the ashby- prefix when falling back to slug", () => {
    const result = resolveCompanyName({
      provider: "ASHBY",
      slug: "ashby-acmecorp",
      rawName: null,
    });
    expect(result.name).toBe("Acmecorp");
    expect(result.source).toBe("slug");
  });

  it("converts hyphens to spaces in the heuristic fallback", () => {
    const result = resolveCompanyName({
      provider: "ASHBY",
      slug: "ashby-some-multi-word-co",
      rawName: "some-multi-word-co",
    });
    expect(result.name).toBe("Some Multi Word Co");
  });

  it("hits a shared override from the Ashby side", () => {
    const result = resolveCompanyName({
      provider: "ASHBY",
      slug: "ashby-openai",
      rawName: "openai",
    });
    expect(result).toEqual({ name: "OpenAI", source: "override" });
  });
});
