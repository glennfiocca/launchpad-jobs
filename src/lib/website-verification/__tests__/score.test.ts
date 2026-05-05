import { describe, it, expect } from "vitest";
import {
  bestSignalScore,
  jaccardSimilarity,
  tokenize,
} from "../score";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumerics", () => {
    expect([...tokenize("Datadog · Cloud Monitoring")]).toEqual([
      "datadog",
      "cloud",
      "monitoring",
    ]);
  });

  it("returns empty set for null / undefined / blank", () => {
    expect(tokenize(null).size).toBe(0);
    expect(tokenize(undefined).size).toBe(0);
    expect(tokenize("   ").size).toBe(0);
    expect(tokenize("---").size).toBe(0);
  });

  it("dedupes repeated tokens", () => {
    expect(tokenize("Acme Acme Inc").size).toBe(2);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical token sets after normalization", () => {
    expect(jaccardSimilarity("Datadog", "datadog!")).toBe(1);
  });

  it("returns a fractional score on partial overlap", () => {
    // tokens(a) = {datadog}, tokens(b) = {datadog, cloud, monitoring}
    // intersection 1, union 3 → 1/3
    expect(jaccardSimilarity("Datadog", "Datadog Cloud Monitoring")).toBeCloseTo(1 / 3, 5);
  });

  it("returns 0 when either side is empty", () => {
    expect(jaccardSimilarity("Datadog", "")).toBe(0);
    expect(jaccardSimilarity(null, "anything")).toBe(0);
  });

  it("returns 0 when token sets are disjoint", () => {
    expect(jaccardSimilarity("Datadog", "Acme Corp")).toBe(0);
  });
});

describe("bestSignalScore", () => {
  it("picks the highest-scoring signal", () => {
    const result = bestSignalScore("Datadog", [
      { source: "title", value: "Cloud Monitoring as a Service" },
      { source: "og:site_name", value: "Datadog" },
      { source: "application-name", value: "DD" },
    ]);
    expect(result.source).toBe("og:site_name");
    expect(result.value).toBe("Datadog");
    expect(result.score).toBe(1);
  });

  it("returns zero score with null fields when no signals provided", () => {
    const result = bestSignalScore("Datadog", []);
    expect(result.source).toBeNull();
    expect(result.value).toBeNull();
    expect(result.score).toBe(0);
  });
});
