import { describe, it, expect } from "vitest";
import { toApex } from "../to-apex";

describe("toApex", () => {
  it("strips careers. prefix", () => {
    expect(toApex("https://careers.datadoghq.com")).toBe(
      "https://datadoghq.com",
    );
  });

  it("strips jobs. prefix and discards path/search/hash", () => {
    expect(toApex("https://jobs.elastic.co/foo/bar?x=1#y")).toBe(
      "https://elastic.co",
    );
  });

  it("strips apply. prefix", () => {
    expect(toApex("https://apply.notion.so")).toBe("https://notion.so");
  });

  it("strips career. prefix", () => {
    expect(toApex("https://career.example.com/positions")).toBe(
      "https://example.com",
    );
  });

  it("strips join. prefix", () => {
    expect(toApex("https://join.slack.com")).toBe("https://slack.com");
  });

  it("leaves apex hostnames untouched (drops path though)", () => {
    expect(toApex("https://datadoghq.com")).toBe("https://datadoghq.com");
  });

  it("returns malformed input as-is", () => {
    expect(toApex("not a url")).toBe("not a url");
  });

  it("preserves http:// scheme — does not force https", () => {
    expect(toApex("http://careers.example.com")).toBe("http://example.com");
  });

  it("does not strip non-listed prefixes (boards. stays)", () => {
    expect(toApex("https://boards.greenhouse.io/anthropic")).toBe(
      "https://boards.greenhouse.io",
    );
  });

  it("does not over-strip multi-level TLDs", () => {
    // careers.example.co.uk → example.co.uk (only the careers. prefix)
    expect(toApex("https://careers.example.co.uk/x")).toBe(
      "https://example.co.uk",
    );
  });

  it("drops www. is NOT in the prefix list — leaves www untouched", () => {
    expect(toApex("https://www.stripe.com")).toBe("https://www.stripe.com");
  });
});
