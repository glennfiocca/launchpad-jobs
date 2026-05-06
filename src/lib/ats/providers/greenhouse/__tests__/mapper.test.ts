import { describe, it, expect } from "vitest";
import {
  mapGreenhouseJobToNormalized,
  mapGreenhouseQuestionToNormalized,
  mapFieldType,
} from "../mapper";
import type { GreenhouseJob, GreenhouseQuestion } from "../types";

// --- Helpers ---

function makeGhJob(overrides: Partial<GreenhouseJob> = {}): GreenhouseJob {
  return {
    id: 12345,
    title: "Backend Engineer",
    updated_at: "2025-06-01T10:00:00Z",
    requisition_id: null,
    location: { name: "New York, NY" },
    absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
    metadata: [],
    content: "<p>Job description here</p>",
    departments: [{ id: 1, name: "Engineering", parent_id: null }],
    offices: [{ id: 1, name: "NYC", location: "New York, NY" }],
    ...overrides,
  };
}

function makeGhQuestion(
  overrides: Partial<GreenhouseQuestion> = {}
): GreenhouseQuestion {
  return {
    label: "Custom Question",
    required: false,
    description: null,
    fields: [
      {
        name: "question_001",
        type: "input_text",
        values: [],
      },
    ],
    ...overrides,
  };
}

// --- mapFieldType ---

describe("mapFieldType", () => {
  it.each([
    ["input_text", "text"],
    ["textarea", "textarea"],
    ["input_file", "file"],
    ["multi_value_single_select", "select"],
    ["multi_value_multi_select", "multiselect"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(mapFieldType(input)).toBe(expected);
  });

  it("defaults unknown types to text", () => {
    expect(mapFieldType("unknown_type")).toBe("text");
  });
});

// --- mapGreenhouseJobToNormalized ---

describe("mapGreenhouseJobToNormalized", () => {
  it("maps a full Greenhouse job to normalized shape", () => {
    const job = makeGhJob();
    const result = mapGreenhouseJobToNormalized(job, "acme");

    expect(result).toEqual({
      externalId: "12345",
      title: "Backend Engineer",
      location: "New York, NY",
      department: "Engineering",
      employmentType: null,
      experienceLevel: "mid",
      remote: false,
      absoluteUrl: "https://boards.greenhouse.io/acme/jobs/12345",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
      content: "<p>Job description here</p>",
      postedAt: new Date("2025-06-01T10:00:00Z"),
      countryCode: "US",
      locationCategory: "US_BASED",
      isUSEligible: true,
    });
  });

  it("detects remote jobs from location string", () => {
    const job = makeGhJob({ location: { name: "Remote - US" } });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.remote).toBe(true);
  });

  it("handles missing location", () => {
    const job = makeGhJob({ location: undefined as never });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.location).toBeNull();
    expect(result.remote).toBe(false);
  });

  it("handles empty departments", () => {
    const job = makeGhJob({ departments: [] });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.department).toBeNull();
  });

  it("handles missing content", () => {
    const job = makeGhJob({ content: undefined as never });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.content).toBeNull();
  });

  it("handles missing updated_at", () => {
    const job = makeGhJob({ updated_at: undefined as never });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.postedAt).toBeNull();
  });

  it("converts numeric id to string externalId", () => {
    const job = makeGhJob({ id: 99999 });
    const result = mapGreenhouseJobToNormalized(job, "acme");
    expect(result.externalId).toBe("99999");
    expect(typeof result.externalId).toBe("string");
  });
});

// --- mapGreenhouseQuestionToNormalized ---

describe("mapGreenhouseQuestionToNormalized", () => {
  it("maps a text question to normalized shape", () => {
    const q = makeGhQuestion({
      label: "Why do you want this job?",
      required: true,
      description: "Be specific",
      fields: [{ name: "q_001", type: "textarea", values: [] }],
    });

    const result = mapGreenhouseQuestionToNormalized(q);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "q_001",
      label: "Why do you want this job?",
      required: true,
      description: "Be specific",
      fieldType: "textarea",
    });
  });

  it("maps a select question with options", () => {
    const q = makeGhQuestion({
      label: "Work Authorization",
      fields: [
        {
          name: "q_002",
          type: "multi_value_single_select",
          values: [
            { value: 1, label: "Yes" },
            { value: 2, label: "No" },
          ],
        },
      ],
    });

    const result = mapGreenhouseQuestionToNormalized(q);

    expect(result).toHaveLength(1);
    expect(result[0].fieldType).toBe("select");
    expect(result[0].options).toEqual([
      { value: "1", label: "Yes" },
      { value: "2", label: "No" },
    ]);
  });

  it("emits one NormalizedQuestion per field", () => {
    const q = makeGhQuestion({
      label: "Multi-field Q",
      fields: [
        { name: "field_a", type: "input_text", values: [] },
        { name: "field_b", type: "textarea", values: [] },
      ],
    });

    const result = mapGreenhouseQuestionToNormalized(q);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("field_a");
    expect(result[1].id).toBe("field_b");
  });

  it("does not include options for non-select types", () => {
    const q = makeGhQuestion({
      fields: [{ name: "q_text", type: "input_text", values: [] }],
    });

    const result = mapGreenhouseQuestionToNormalized(q);
    expect(result[0].options).toBeUndefined();
  });
});
