import { describe, it, expect } from "vitest";
import {
  buildApplicationSummaryData,
  buildSummaryFileName,
  buildSummarySpacesKey,
  OPERATOR_SUMMARY_KIND,
} from "../application-summary-data";

const baseSnapshot = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "555-0100",
  location: "San Francisco, CA",
  boardToken: "acme",
  externalId: "12345",
  manualApplyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
  resumeFileName: "Jane-Doe-Resume.pdf",
  resumeSpacesKey: "resumes/jane.pdf",
  trackingEmail: "track-12345@inbound.pipeline.dev",
  questionAnswers: {
    why_acme: "I love their mission.",
    pronouns: "she/her",
    eligible_to_work: "Yes",
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
    { label: "Eligible to work in US?", fieldName: "eligible_to_work", fieldType: "input_text" },
  ],
  pendingQuestions: [
    {
      label: "How did you hear about us?",
      fieldName: "referral_source",
      fieldType: "input_text",
      required: true,
      description: null,
    },
    {
      label: "Years of TS experience",
      fieldName: "years_ts",
      fieldType: "input_text",
      required: false,
      description: null,
      userAnswer: "5",
    },
  ],
  snapshotAt: "2026-04-30T12:00:00.000Z",
  coreFieldExtras: {
    preferredFirstName: "Janie",
    country: "United States",
    linkedIn: "https://linkedin.com/in/janedoe",
    eeoc: {
      gender: null,
      race: null,
      veteranStatus: null,
      disability: null,
    },
  },
};

describe("buildApplicationSummaryData", () => {
  const fixedNow = new Date("2026-05-01T08:30:00.000Z");

  it("maps applicant + tracking blocks from a complete snapshot", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_abc",
      jobTitle: "Senior Engineer",
      companyName: "Acme",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
      snapshot: baseSnapshot,
      now: fixedNow,
    });

    expect(data.header).toEqual({
      applicationId: "app_abc",
      jobTitle: "Senior Engineer",
      companyName: "Acme",
      applyUrl: "https://boards.greenhouse.io/acme/jobs/12345",
      generatedAt: fixedNow,
    });
    expect(data.applicant.fullName).toBe("Jane Doe");
    expect(data.applicant.preferredFirstName).toBe("Janie");
    expect(data.applicant.linkedIn).toBe("https://linkedin.com/in/janedoe");
    expect(data.tracking.boardToken).toBe("acme");
    expect(data.tracking.externalId).toBe("12345");
    expect(data.tracking.trackingEmail).toBe("track-12345@inbound.pipeline.dev");
  });

  it("resolves select-style answers via selectValues label map", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_abc",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot: baseSnapshot,
      now: fixedNow,
    });

    const pronouns = data.answered.find((q) => q.label === "Pronouns");
    expect(pronouns?.answer).toBe("She / Her");
  });

  it("separates answered vs unanswered pending questions correctly", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_abc",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot: baseSnapshot,
      now: fixedNow,
    });
    const unanswered = data.pending.filter((q) => q.status === "unanswered");
    const partial = data.pending.filter((q) => q.status === "answered");
    expect(unanswered).toHaveLength(1);
    expect(unanswered[0].label).toBe("How did you hear about us?");
    expect(unanswered[0].required).toBe(true);
    expect(partial).toHaveLength(1);
    expect(partial[0].answer).toBe("5");
  });

  it("adds operator notes when required pending questions exist", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_abc",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot: baseSnapshot,
      now: fixedNow,
    });
    expect(data.operatorNotes.some((n) => n.includes("required field"))).toBe(true);
    expect(data.operatorNotes.some((n) => n.includes("EEOC"))).toBe(true);
  });

  it("survives a sparse legacy snapshot without crashing", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_old",
      jobTitle: "Engineer",
      companyName: "Initech",
      applyUrl: null,
      snapshot: {
        firstName: "John",
        lastName: "Smith",
        email: "j@s.com",
        boardToken: "initech",
        externalId: "999",
        questionAnswers: {},
        questionMeta: [],
        pendingQuestions: [],
        snapshotAt: "2026-01-01T00:00:00Z",
      },
      now: fixedNow,
    });
    expect(data.applicant.fullName).toBe("John Smith");
    expect(data.applicant.phone).toBeNull();
    expect(data.answered).toHaveLength(0);
    expect(data.pending).toHaveLength(0);
    expect(data.eeoc).toBeNull();
    expect(data.operatorNotes).toContain(
      "No resume file recorded — applicant may need to be contacted."
    );
  });

  it("handles a fully empty snapshot without throwing", () => {
    const data = buildApplicationSummaryData({
      applicationId: "app_empty",
      jobTitle: "X",
      companyName: "Y",
      applyUrl: null,
      snapshot: {},
      now: fixedNow,
    });
    expect(data.applicant.fullName).toBe("(unknown applicant)");
    expect(data.applicant.email).toBe("(no email)");
    expect(data.tracking.boardToken).toBe("(unknown)");
  });
});

describe("buildSummaryFileName", () => {
  it("produces a stable, filesystem-safe name", () => {
    const name = buildSummaryFileName("app_abc", new Date("2026-05-01T08:30:00.000Z"));
    expect(name).toMatch(/^application-app_abc-summary-2026-05-01T08-30-00-000Z\.pdf$/);
    expect(name).not.toContain(":");
  });
});

describe("buildSummarySpacesKey", () => {
  it("uses a stable per-application key (idempotent overwrite)", () => {
    const k1 = buildSummarySpacesKey("app_abc");
    const k2 = buildSummarySpacesKey("app_abc");
    expect(k1).toBe(k2);
    expect(k1).toContain(OPERATOR_SUMMARY_KIND.toLowerCase());
    expect(k1).toMatch(/^application-documents\/app_abc\//);
  });
});
