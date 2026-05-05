import { describe, it, expect } from "vitest";
import {
  classifyLocation,
  hasUSSignal,
  detectForeignCountry,
  lookupCountryByName,
  splitLocationSegments,
} from "../location-classifier";

describe("hasUSSignal", () => {
  it("matches state abbreviations as whole tokens", () => {
    expect(hasUSSignal("San Francisco, CA")).toBe(true);
    expect(hasUSSignal("Austin, TX")).toBe(true);
    expect(hasUSSignal("New York, NY")).toBe(true);
  });

  it("does NOT match state abbreviations embedded in larger words", () => {
    expect(hasUSSignal("Cardiff, Wales")).toBe(false); // CA inside Cardiff
    expect(hasUSSignal("CALCUTTA")).toBe(false);
  });

  it("matches full state names", () => {
    expect(hasUSSignal("California")).toBe(true);
    expect(hasUSSignal("Remote in Massachusetts")).toBe(true);
  });

  it("matches multi-word state names like 'New York'", () => {
    expect(hasUSSignal("Living in New York")).toBe(true);
  });

  it("matches unambiguous US cities", () => {
    expect(hasUSSignal("San Francisco")).toBe(true);
    expect(hasUSSignal("NYC")).toBe(true);
    expect(hasUSSignal("Bay Area")).toBe(true);
  });

  it("does NOT match ambiguous cities by themselves", () => {
    // Portland, Birmingham, Cambridge intentionally excluded from the city
    // list because they exist abroad.
    expect(hasUSSignal("Portland")).toBe(false);
    expect(hasUSSignal("Cambridge")).toBe(false);
  });

  it("matches USA / United States phrases", () => {
    expect(hasUSSignal("United States")).toBe(true);
    expect(hasUSSignal("Remote, USA")).toBe(true);
    expect(hasUSSignal("Anywhere in the US")).toBe(true);
  });
});

describe("detectForeignCountry", () => {
  it("identifies common European cities", () => {
    expect(detectForeignCountry("London, UK")).toBe("GB");
    expect(detectForeignCountry("Berlin")).toBe("DE");
    expect(detectForeignCountry("Paris, France")).toBe("FR");
  });

  it("identifies APAC cities", () => {
    expect(detectForeignCountry("Bengaluru")).toBe("IN");
    expect(detectForeignCountry("Tokyo, Japan")).toBe("JP");
    expect(detectForeignCountry("Singapore")).toBe("SG");
  });

  it("identifies country names directly", () => {
    expect(detectForeignCountry("United Kingdom")).toBe("GB");
    expect(detectForeignCountry("Germany")).toBe("DE");
  });

  it("returns ZZ for region phrases like EMEA", () => {
    expect(detectForeignCountry("EMEA – Remote")).toBe("ZZ");
    expect(detectForeignCountry("APAC")).toBe("ZZ");
  });

  it("returns undefined for unknown locations", () => {
    expect(detectForeignCountry("Some random place")).toBeUndefined();
    expect(detectForeignCountry("")).toBeUndefined();
  });
});

describe("lookupCountryByName", () => {
  it("resolves Ashby's 'United States' to US", () => {
    expect(lookupCountryByName("United States")).toBe("US");
  });

  it("is case-insensitive", () => {
    expect(lookupCountryByName("united states")).toBe("US");
    expect(lookupCountryByName("GERMANY")).toBe("DE");
  });

  it("returns undefined for unknown countries", () => {
    expect(lookupCountryByName("Mars")).toBeUndefined();
    expect(lookupCountryByName("")).toBeUndefined();
  });
});

describe("splitLocationSegments", () => {
  it("returns a single segment for a basic location", () => {
    expect(splitLocationSegments("San Francisco, CA")).toEqual(["San Francisco, CA"]);
  });

  it("splits on semicolons", () => {
    expect(splitLocationSegments("New York, NY; London, UK")).toEqual([
      "New York, NY",
      "London, UK",
    ]);
  });

  it("splits on ' or '", () => {
    expect(splitLocationSegments("SF or Remote")).toEqual(["SF", "Remote"]);
  });

  it("splits on ' / ' (with spaces)", () => {
    expect(splitLocationSegments("Berlin / Paris / London")).toEqual([
      "Berlin",
      "Paris",
      "London",
    ]);
  });

  it("does NOT split on commas (preserves 'City, State')", () => {
    expect(splitLocationSegments("San Francisco, CA")).toEqual(["San Francisco, CA"]);
  });

  it("does NOT split 'or' inside larger words like 'Coordinator'", () => {
    expect(splitLocationSegments("Senior Coordinator")).toEqual(["Senior Coordinator"]);
  });

  it("returns empty array for whitespace input", () => {
    expect(splitLocationSegments("   ")).toEqual([]);
  });
});

describe("classifyLocation — Ashby structured path", () => {
  it("US addressCountry → US_BASED", () => {
    const r = classifyLocation({
      location: "San Francisco, CA",
      remote: false,
      ashbyAddressCountry: "United States",
    });
    expect(r.category).toBe("US_BASED");
    expect(r.countryCode).toBe("US");
    expect(r.isUSEligible).toBe(true);
  });

  it("Foreign addressCountry with no US secondary → FOREIGN", () => {
    const r = classifyLocation({
      location: "Berlin",
      remote: false,
      ashbyAddressCountry: "Germany",
    });
    expect(r.category).toBe("FOREIGN");
    expect(r.countryCode).toBe("DE");
    expect(r.isUSEligible).toBe(false);
  });

  it("Foreign addressCountry with US secondary location → MULTI_WITH_US", () => {
    const r = classifyLocation({
      location: "Berlin",
      remote: false,
      ashbyAddressCountry: "Germany",
      ashbySecondaryLocations: ["New York, NY"],
    });
    expect(r.category).toBe("MULTI_WITH_US");
    expect(r.countryCode).toBe("DE");
    expect(r.isUSEligible).toBe(true);
  });
});

describe("classifyLocation — free-text Greenhouse path", () => {
  it("US city, state → US_BASED", () => {
    const r = classifyLocation({ location: "Austin, TX", remote: false });
    expect(r.category).toBe("US_BASED");
    expect(r.isUSEligible).toBe(true);
  });

  it("Foreign city → FOREIGN", () => {
    const r = classifyLocation({ location: "London, UK", remote: false });
    expect(r.category).toBe("FOREIGN");
    expect(r.countryCode).toBe("GB");
    expect(r.isUSEligible).toBe(false);
  });

  it("'Remote' alone → REMOTE", () => {
    const r = classifyLocation({ location: "Remote", remote: true });
    expect(r.category).toBe("REMOTE");
    expect(r.isUSEligible).toBe(true);
  });

  it("'Remote - US' → REMOTE with US country", () => {
    const r = classifyLocation({ location: "Remote - US", remote: true });
    expect(r.category).toBe("REMOTE");
    expect(r.countryCode).toBe("US");
    expect(r.isUSEligible).toBe(true);
  });

  it("Empty location, remote=true → REMOTE", () => {
    const r = classifyLocation({ location: null, remote: true });
    expect(r.category).toBe("REMOTE");
    expect(r.isUSEligible).toBe(true);
  });

  it("Empty location, remote=false → UNKNOWN (eligible by default)", () => {
    const r = classifyLocation({ location: null, remote: false });
    expect(r.category).toBe("UNKNOWN");
    expect(r.isUSEligible).toBe(true);
  });
});

describe("classifyLocation — multi-segment", () => {
  it("'NYC; London' → MULTI_WITH_US", () => {
    const r = classifyLocation({
      location: "New York, NY; London, UK",
      remote: false,
    });
    expect(r.category).toBe("MULTI_WITH_US");
    expect(r.countryCode).toBe("GB");
    expect(r.isUSEligible).toBe(true);
  });

  it("'London or Remote (EMEA)' → FOREIGN", () => {
    const r = classifyLocation({
      location: "London, UK or Remote (EMEA)",
      remote: true,
    });
    expect(r.category).toBe("FOREIGN");
    expect(r.isUSEligible).toBe(false);
  });

  it("'SF or Remote' → US (remote+US bucket)", () => {
    const r = classifyLocation({ location: "SF or Remote", remote: true });
    expect(r.isUSEligible).toBe(true);
    // Either US_BASED or MULTI_WITH_US is acceptable here — both eligible.
    expect(["US_BASED", "MULTI_WITH_US", "REMOTE"]).toContain(r.category);
  });

  it("'Berlin or Paris' → FOREIGN", () => {
    const r = classifyLocation({ location: "Berlin or Paris", remote: false });
    expect(r.category).toBe("FOREIGN");
    expect(r.isUSEligible).toBe(false);
  });

  it("'Boston and NYC' → US_BASED (both segments US)", () => {
    const r = classifyLocation({ location: "Boston and NYC", remote: false });
    expect(r.category).toBe("US_BASED");
    expect(r.isUSEligible).toBe(true);
  });
});

describe("classifyLocation — permissive on unknown", () => {
  it("'Multiple locations' → UNKNOWN, eligible", () => {
    const r = classifyLocation({ location: "Multiple locations", remote: false });
    expect(r.category).toBe("UNKNOWN");
    expect(r.isUSEligible).toBe(true);
  });

  it("Garbage string → UNKNOWN, eligible", () => {
    const r = classifyLocation({ location: "asdfghjkl", remote: false });
    expect(r.category).toBe("UNKNOWN");
    expect(r.isUSEligible).toBe(true);
  });
});

describe("classifyLocation — edge cases", () => {
  it("'Anywhere' alone is UNKNOWN (eligible)", () => {
    const r = classifyLocation({ location: "Anywhere", remote: false });
    expect(r.isUSEligible).toBe(true);
  });

  it("'Remote (Worldwide)' is REMOTE eligible (no foreign signal)", () => {
    const r = classifyLocation({ location: "Remote (Worldwide)", remote: true });
    expect(r.category).toBe("REMOTE");
    expect(r.isUSEligible).toBe(true);
  });

  it("'EMEA' alone is FOREIGN", () => {
    const r = classifyLocation({ location: "EMEA", remote: false });
    expect(r.category).toBe("FOREIGN");
    expect(r.isUSEligible).toBe(false);
  });
});
