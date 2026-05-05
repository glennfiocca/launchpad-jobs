import { describe, it, expect } from "vitest";
import {
  resolveCompanyLogoSync,
  lookupLogoOverride,
} from "../company-logo";

describe("lookupLogoOverride", () => {
  it("returns the Astronomer override with canonical .io domain", () => {
    const o = lookupLogoOverride("GREENHOUSE", "astronomer");
    expect(o?.website).toBe("https://astronomer.io");
  });

  it("handles the truncated 'stronomer' alias", () => {
    const o = lookupLogoOverride("GREENHOUSE", "stronomer");
    expect(o?.website).toBe("https://astronomer.io");
  });

  it("strips the ashby- prefix before lookup", () => {
    expect(lookupLogoOverride("ASHBY", "ashby-supabase")).toEqual({
      website: "https://supabase.com",
    });
  });

  it("returns undefined for unknown slugs", () => {
    expect(lookupLogoOverride("GREENHOUSE", "completely-unknown-co")).toBeUndefined();
  });

  it("hits a hyphenated entry like norm-ai", () => {
    expect(lookupLogoOverride("ASHBY", "ashby-norm-ai")).toEqual({
      website: "https://norm.ai",
    });
  });
});

describe("resolveCompanyLogoSync", () => {
  it("returns the override when no board override is set", () => {
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      atsWebsite: "https://astronomer.com", // wrong — ATS-supplied junk
    });
    expect(r.website).toBe("https://astronomer.io");
    expect(r.websiteSource).toBe("override");
  });

  it("CompanyBoard.website wins over the override (admin's edit is freshest)", () => {
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      boardOverrideWebsite: "https://astronomer.io/special",
    });
    expect(r.website).toBe("https://astronomer.io/special");
    expect(r.websiteSource).toBe("board");
  });

  it("falls through to ATS metadata when no override matches", () => {
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "newco",
      atsWebsite: "https://newco.com",
    });
    expect(r.website).toBe("https://newco.com");
    expect(r.websiteSource).toBe("ats");
  });

  it("returns websiteSource='none' when nothing produces a value", () => {
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "completely-new",
    });
    expect(r.website).toBeNull();
    expect(r.websiteSource).toBe("none");
  });

  it("admin board logoUrl wins over override logoUrl", () => {
    // No override has a logoUrl yet, so this just exercises the field path.
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "any-co",
      boardOverrideLogoUrl: "https://cdn.example.com/logo.png",
    });
    expect(r.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(r.logoSource).toBe("board");
  });

  it("ignores empty-string board overrides (treated as 'unset')", () => {
    const r = resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      boardOverrideWebsite: "",
    });
    expect(r.website).toBe("https://astronomer.io");
    expect(r.websiteSource).toBe("override");
  });

});
