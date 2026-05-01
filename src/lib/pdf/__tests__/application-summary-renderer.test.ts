import { describe, it, expect } from "vitest";
import { renderApplicationSummaryPDF } from "../application-summary-renderer";
import { buildApplicationSummaryData } from "../application-summary-data";

const fullSnapshot = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "555-0100",
  location: "San Francisco, CA",
  boardToken: "acme",
  externalId: "12345",
  manualApplyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
  resumeFileName: "resume.pdf",
  trackingEmail: "track-1@inbound.pipeline.dev",
  questionAnswers: {
    why_acme: "I love their mission and the engineering team is world class.",
    pronouns: "she/her",
  },
  questionMeta: [
    { label: "Why Acme?", fieldName: "why_acme", fieldType: "textarea" },
    {
      label: "Pronouns",
      fieldName: "pronouns",
      fieldType: "multi_value_single_select",
      selectValues: [
        { value: "she/her", label: "She / Her" },
        { value: "he/him", label: "He / Him" },
      ],
    },
  ],
  pendingQuestions: [
    {
      label: "How did you hear about us?",
      fieldName: "ref",
      fieldType: "input_text",
      required: true,
      description: null,
    },
  ],
  snapshotAt: "2026-04-30T12:00:00.000Z",
  coreFieldExtras: {
    eeoc: { gender: null, race: null, veteranStatus: null, disability: null },
  },
};

describe("renderApplicationSummaryPDF", () => {
  it("emits a valid PDF buffer with the standard %PDF- header", async () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_abc",
      jobTitle: "Senior Engineer",
      companyName: "Acme",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
      snapshot: fullSnapshot,
    });
    const buf = await renderApplicationSummaryPDF({ data });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
    // EOF marker is the last meaningful bytes in any well-formed PDF.
    expect(buf.slice(-6).toString("ascii")).toContain("%%EOF");
  });

  it("renders without crashing on a sparse snapshot (no crashes from missing fields)", async () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_min",
      jobTitle: "Engineer",
      companyName: "Initech",
      applyUrl: null,
      snapshot: {
        firstName: "John",
        lastName: "Smith",
        email: "j@s.com",
        boardToken: "initech",
        externalId: "1",
        questionAnswers: {},
        questionMeta: [],
        pendingQuestions: [],
        snapshotAt: "2026-01-01T00:00:00Z",
      },
    });
    const buf = await renderApplicationSummaryPDF({ data });
    expect(buf.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
