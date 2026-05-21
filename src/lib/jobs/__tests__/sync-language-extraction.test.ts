import { describe, it, expect, vi } from "vitest";

import { deriveRequiredLanguages } from "@/lib/greenhouse/sync";

// Smoke test for the sync wiring. The full Greenhouse pipeline is too
// heavy to stand up in a unit test (it hits the network and the DB), so
// we exercise the small exported helper that owns the null/empty guard
// plus the call into extractRequiredLanguages. This guarantees the field
// produced at sync time matches what the language-extractor returns for
// the same decoded content.

describe("greenhouse sync — requiredLanguages wiring", () => {
  it("returns ['spanish'] for a known requirement string", () => {
    const result = deriveRequiredLanguages(
      "Must be fluent in Spanish to apply",
    );
    expect(result).toContain("spanish");
  });

  it("returns [] when content is null", () => {
    expect(deriveRequiredLanguages(null)).toEqual([]);
  });

  it("returns [] when content is empty", () => {
    expect(deriveRequiredLanguages("")).toEqual([]);
  });

  it("delegates to extractRequiredLanguages with the raw content", async () => {
    vi.resetModules();
    const extractor = vi.fn().mockReturnValue(["spanish"]);
    vi.doMock("@/lib/jobs/language-extractor", () => ({
      extractRequiredLanguages: extractor,
    }));

    // Re-import the wrapper so it picks up the mocked extractor. Avoids
    // polluting the module cache for other tests in the file.
    const { deriveRequiredLanguages: derive } = await import(
      "@/lib/greenhouse/sync"
    );

    const out = derive("Must speak Spanish fluently");
    expect(extractor).toHaveBeenCalledWith("Must speak Spanish fluently");
    expect(out).toEqual(["spanish"]);

    vi.doUnmock("@/lib/jobs/language-extractor");
    vi.resetModules();
  });

  it("does not call the extractor when content is null", async () => {
    vi.resetModules();
    const extractor = vi.fn().mockReturnValue([]);
    vi.doMock("@/lib/jobs/language-extractor", () => ({
      extractRequiredLanguages: extractor,
    }));

    const { deriveRequiredLanguages: derive } = await import(
      "@/lib/greenhouse/sync"
    );

    expect(derive(null)).toEqual([]);
    expect(extractor).not.toHaveBeenCalled();

    vi.doUnmock("@/lib/jobs/language-extractor");
    vi.resetModules();
  });
});
