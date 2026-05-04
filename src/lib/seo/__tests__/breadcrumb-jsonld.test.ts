import { describe, it, expect, beforeAll } from "vitest";
import { buildBreadcrumbListJsonLd } from "../breadcrumb-jsonld";

beforeAll(() => {
  // Pin APP_URL so tests don't depend on environment.
  process.env.NEXT_PUBLIC_APP_URL = "https://trypipeline.ai";
});

describe("buildBreadcrumbListJsonLd", () => {
  it("returns a valid BreadcrumbList schema envelope", () => {
    const result = buildBreadcrumbListJsonLd([{ label: "Home", href: "/" }]);

    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("BreadcrumbList");
    expect(Array.isArray(result.itemListElement)).toBe(true);
  });

  it("assigns 1-indexed positions to every item", () => {
    const result = buildBreadcrumbListJsonLd([
      { label: "Home", href: "/" },
      { label: "Jobs", href: "/jobs" },
      { label: "Acme — Senior Engineer" },
    ]);

    expect(result.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it("converts relative href to an absolute URL using APP_URL", () => {
    const result = buildBreadcrumbListJsonLd([
      { label: "Jobs", href: "/jobs" },
    ]);

    expect(result.itemListElement[0].item).toBe("https://trypipeline.ai/jobs");
  });

  it("preserves an already-absolute href", () => {
    const result = buildBreadcrumbListJsonLd([
      { label: "External", href: "https://example.com/path" },
    ]);

    expect(result.itemListElement[0].item).toBe("https://example.com/path");
  });

  it("normalizes hrefs missing a leading slash", () => {
    const result = buildBreadcrumbListJsonLd([
      { label: "Jobs", href: "jobs" },
    ]);

    expect(result.itemListElement[0].item).toBe("https://trypipeline.ai/jobs");
  });

  it("omits item when no href is provided (trailing crumb)", () => {
    const result = buildBreadcrumbListJsonLd([
      { label: "Home", href: "/" },
      { label: "Current Page" },
    ]);

    expect(result.itemListElement[1].item).toBeUndefined();
    expect(result.itemListElement[1].name).toBe("Current Page");
  });

  it("preserves item label as-is (no truncation, no escaping)", () => {
    const label = "Senior Software Engineer (Remote / Full-time)";
    const result = buildBreadcrumbListJsonLd([{ label }]);
    expect(result.itemListElement[0].name).toBe(label);
  });

  it("returns an empty itemListElement for an empty trail", () => {
    const result = buildBreadcrumbListJsonLd([]);
    expect(result.itemListElement).toEqual([]);
  });
});
