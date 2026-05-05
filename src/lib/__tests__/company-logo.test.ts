import { describe, it, expect, beforeAll } from "vitest";
import {
  resolveCompanyLogoSync,
  lookupLogoOverride,
} from "../company-logo";

// Force the TS-map fallback path for unit tests — these tests cover the
// curated map's behavior, not the DB-backed runtime layer (which is covered
// at the integration level via the admin API + B.4 migration).
beforeAll(() => {
  process.env.LOGO_OVERRIDES_FROM_DB = "false";
});

describe("lookupLogoOverride", () => {
  it("returns the Astronomer override with canonical .io domain", async () => {
    const o = await lookupLogoOverride("GREENHOUSE", "astronomer");
    expect(o?.website).toBe("https://astronomer.io");
  });

  it("handles the truncated 'stronomer' alias", async () => {
    const o = await lookupLogoOverride("GREENHOUSE", "stronomer");
    expect(o?.website).toBe("https://astronomer.io");
  });

  it("strips the ashby- prefix before lookup", async () => {
    expect(await lookupLogoOverride("ASHBY", "ashby-supabase")).toEqual({
      website: "https://supabase.com",
    });
  });

  it("returns null for unknown slugs", async () => {
    expect(await lookupLogoOverride("GREENHOUSE", "completely-unknown-co")).toBeNull();
  });

  it("hits a hyphenated entry like norm-ai", async () => {
    expect(await lookupLogoOverride("ASHBY", "ashby-norm-ai")).toEqual({
      website: "https://norm.ai",
    });
  });
});

describe("resolveCompanyLogoSync", () => {
  it("returns the override when no board override is set", async () => {
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      atsWebsite: "https://astronomer.com", // wrong — ATS-supplied junk
    });
    expect(r.website).toBe("https://astronomer.io");
    expect(r.websiteSource).toBe("override");
  });

  it("CompanyBoard.website wins over the override (admin's edit is freshest)", async () => {
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      boardOverrideWebsite: "https://astronomer.io/special",
    });
    expect(r.website).toBe("https://astronomer.io/special");
    expect(r.websiteSource).toBe("board");
  });

  it("falls through to ATS metadata when no override matches", async () => {
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "newco",
      atsWebsite: "https://newco.com",
    });
    expect(r.website).toBe("https://newco.com");
    expect(r.websiteSource).toBe("ats");
  });

  it("returns websiteSource='none' when nothing produces a value", async () => {
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "completely-new",
    });
    expect(r.website).toBeNull();
    expect(r.websiteSource).toBe("none");
  });

  it("admin board logoUrl wins over override logoUrl", async () => {
    // No override has a logoUrl yet, so this just exercises the field path.
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "any-co",
      boardOverrideLogoUrl: "https://cdn.example.com/logo.png",
    });
    expect(r.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(r.logoSource).toBe("board");
  });

  it("ignores empty-string board overrides (treated as 'unset')", async () => {
    const r = await resolveCompanyLogoSync({
      provider: "GREENHOUSE",
      slug: "astronomer",
      boardOverrideWebsite: "",
    });
    expect(r.website).toBe("https://astronomer.io");
    expect(r.websiteSource).toBe("override");
  });

  // Track B.5 of HARDENING_PLAN.md: every code path that produces a logoUrl
  // must report a step source so the writer can derive the persisted
  // `Company.logoSource` value. These tests pin the step values the
  // ats/sync.ts upsert path branches on (override / board / ats / none).
  describe("logoSource step values (B.5)", () => {
    it("override-map-supplied logoUrl reports logoSource='override'", async () => {
      const r = await resolveCompanyLogoSync({
        provider: "GREENHOUSE",
        slug: "astronomer", // override map has logoUrl
      });
      expect(r.logoUrl).toContain("img.logo.dev/astronomer.io");
      expect(r.logoSource).toBe("override");
    });

    it("board-override logoUrl reports logoSource='board'", async () => {
      const r = await resolveCompanyLogoSync({
        provider: "GREENHOUSE",
        slug: "astronomer",
        boardOverrideLogoUrl: "https://cdn.example.com/astronomer.png",
      });
      expect(r.logoSource).toBe("board");
    });

    it("ATS-supplied logoUrl reports logoSource='ats'", async () => {
      const r = await resolveCompanyLogoSync({
        provider: "GREENHOUSE",
        slug: "newco",
        atsLogoUrl: "https://greenhouse.cdn.example.com/newco.png",
      });
      expect(r.logoSource).toBe("ats");
    });

    it("nothing produces a logoUrl → logoSource='none'", async () => {
      const r = await resolveCompanyLogoSync({
        provider: "GREENHOUSE",
        slug: "completely-empty",
      });
      expect(r.logoUrl).toBeNull();
      expect(r.logoSource).toBe("none");
    });
  });
});
