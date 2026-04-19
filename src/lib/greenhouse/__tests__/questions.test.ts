import { describe, it, expect } from "vitest";
import { autoAnswerQuestion, getUnansweredQuestions } from "../questions";
import type { GreenhouseQuestion } from "@/types";
import type { UserProfile } from "@prisma/client";

// Minimal profile factory
function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    resumeData: null,
    resumeUrl: null,
    resumeFileName: null,
    resumeMimeType: null,
    headline: null,
    summary: null,
    currentTitle: null,
    currentCompany: null,
    yearsExperience: null,
    desiredSalaryMin: null,
    desiredSalaryMax: null,
    openToRemote: true,
    openToHybrid: true,
    openToOnsite: false,
    highestDegree: null,
    fieldOfStudy: null,
    university: null,
    universityId: null,
    graduationYear: null,
    locationPlaceId: null,
    locationFormatted: null,
    locationStreet: null,
    locationCity: null,
    locationState: null,
    locationPostalCode: null,
    locationLat: null,
    locationLng: null,
    workAuthorization: null,
    requiresSponsorship: false,
    voluntaryGender: null,
    voluntaryRace: null,
    voluntaryVeteranStatus: null,
    voluntaryDisability: null,
    customAnswers: null,
    isComplete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    preferredFirstName: null as string | null,
    ...overrides,
  } as UserProfile;
}

// Minimal question factory
function makeQuestion(
  label: string,
  fieldName: string,
  type: GreenhouseQuestion["fields"][0]["type"],
  values: Array<{ value: number; label: string }> = [],
  required = false
): GreenhouseQuestion {
  return {
    label,
    required,
    description: null,
    fields: [{ name: fieldName, type, values }],
  };
}

// ── EEOC label matching ──────────────────────────────────────────────────────

describe("autoAnswerQuestion — EEOC gender", () => {
  const q = makeQuestion("Gender Identity", "question_111", "multi_value_single_select", [
    { value: 101, label: "Male" },
    { value: 102, label: "Female" },
    { value: 103, label: "Decline to self-identify" },
  ]);

  it("matches exact gender label", () => {
    const profile = makeProfile({ voluntaryGender: "Female" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_111: 102 });
  });

  it("returns null when profile has no voluntaryGender", () => {
    const profile = makeProfile({ voluntaryGender: null });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });

  it("returns null when gender label has no match in field values", () => {
    const profile = makeProfile({ voluntaryGender: "Non-binary" });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });
});

describe("autoAnswerQuestion — EEOC race/ethnicity", () => {
  const qSingle = makeQuestion("Race/Ethnicity", "question_222", "multi_value_single_select", [
    { value: 201, label: "White" },
    { value: 202, label: "Black or African American" },
    { value: 203, label: "Hispanic or Latino" },
  ]);

  const qMulti = makeQuestion("Race / Ethnicity", "question_223", "multi_value_multi_select", [
    { value: 201, label: "White" },
    { value: 202, label: "Black or African American" },
  ]);

  it("matches race on single-select (case-insensitive)", () => {
    const profile = makeProfile({ voluntaryRace: "white" });
    expect(autoAnswerQuestion(qSingle, profile)).toEqual({ question_222: 201 });
  });

  it("returns string value for multi-select race", () => {
    const profile = makeProfile({ voluntaryRace: "White" });
    expect(autoAnswerQuestion(qMulti, profile)).toEqual({ question_223: "201" });
  });

  it("returns null when voluntaryRace is null", () => {
    const profile = makeProfile({ voluntaryRace: null });
    expect(autoAnswerQuestion(qSingle, profile)).toBeNull();
  });
});

describe("autoAnswerQuestion — EEOC veteran status", () => {
  const q = makeQuestion("Veteran Status", "question_333", "multi_value_single_select", [
    { value: 301, label: "I am a protected veteran" },
    { value: 302, label: "I am not a protected veteran" },
  ]);

  it("matches veteran label", () => {
    const profile = makeProfile({ voluntaryVeteranStatus: "I am not a protected veteran" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_333: 302 });
  });
});

describe("autoAnswerQuestion — EEOC disability", () => {
  const q = makeQuestion("Disability Status", "question_444", "multi_value_single_select", [
    { value: 401, label: "Yes, I have a disability" },
    { value: 402, label: "No, I do not have a disability" },
  ]);

  it("matches disability label", () => {
    const profile = makeProfile({ voluntaryDisability: "No, I do not have a disability" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_444: 402 });
  });
});

// ── Country inference ────────────────────────────────────────────────────────

describe("autoAnswerQuestion — country", () => {
  const q = makeQuestion("Country", "question_555", "multi_value_single_select", [
    { value: 501, label: "United States" },
    { value: 502, label: "Canada" },
    { value: 503, label: "United Kingdom" },
  ]);

  it("infers United States from locationFormatted last segment 'USA'", () => {
    const profile = makeProfile({ locationFormatted: "Austin, TX, USA" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_555: 501 });
  });

  it("infers United States from locationFormatted last segment 'United States'", () => {
    const profile = makeProfile({ locationFormatted: "San Francisco, CA, United States" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_555: 501 });
  });

  it("infers United States when locationState is set (US state code)", () => {
    const profile = makeProfile({ locationState: "CA", locationFormatted: null });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_555: 501 });
  });

  it("returns null when no location data is available", () => {
    const profile = makeProfile({ locationFormatted: null, location: null, locationState: null });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });

  it("matches a question labeled 'Country of Residence'", () => {
    const q2 = { ...q, label: "Country of Residence" };
    const profile = makeProfile({ locationFormatted: "New York, NY, USA" });
    expect(autoAnswerQuestion(q2, profile)).toEqual({ question_555: 501 });
  });
});

// ── Preferred first name ─────────────────────────────────────────────────────

describe("autoAnswerQuestion — preferred first name", () => {
  const q = makeQuestion("Preferred First Name", "question_666", "input_text");

  it("returns preferredFirstName when set", () => {
    const profile = makeProfile({ preferredFirstName: "Alex" });
    expect(autoAnswerQuestion(q, profile)).toEqual({ question_666: "Alex" });
  });

  it("returns null when preferredFirstName is null", () => {
    const profile = makeProfile({ preferredFirstName: null });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });

  it("matches label 'Nickname'", () => {
    const q2 = { ...q, label: "Nickname" };
    const profile = makeProfile({ preferredFirstName: "Alex" });
    expect(autoAnswerQuestion(q2, profile)).toEqual({ question_666: "Alex" });
  });

  it("returns null when field type is not input_text", () => {
    const q3 = makeQuestion("Preferred First Name", "question_777", "multi_value_single_select", [
      { value: 1, label: "Alex" },
    ]);
    const profile = makeProfile({ preferredFirstName: "Alex" });
    expect(autoAnswerQuestion(q3, profile)).toBeNull();
  });
});

// ── Multi-select serialization round-trip ────────────────────────────────────

describe("multi-select serialization", () => {
  it("splits comma-separated ids consistently", () => {
    const raw = "201,202,203";
    const ids = raw.split(",").map((s) => s.trim());
    expect(ids).toEqual(["201", "202", "203"]);
    expect(ids.join(",")).toBe("201,202,203");
  });

  it("handles whitespace around values", () => {
    const raw = "201, 202 , 203";
    const ids = raw.split(",").map((s) => s.trim());
    expect(ids).toEqual(["201", "202", "203"]);
  });
});

// ── getUnansweredQuestions ───────────────────────────────────────────────────

describe("getUnansweredQuestions", () => {
  it("excludes EEOC questions that can be auto-answered from profile", () => {
    const questions: GreenhouseQuestion[] = [
      makeQuestion("Gender Identity", "question_111", "multi_value_single_select", [
        { value: 101, label: "Male" },
        { value: 102, label: "Female" },
      ], true),
      makeQuestion("Custom essay question", "question_999", "textarea", [], true),
    ];
    const profile = makeProfile({ voluntaryGender: "Female" });
    const unanswered = getUnansweredQuestions(questions, profile);
    expect(unanswered).toHaveLength(1);
    expect(unanswered[0].label).toBe("Custom essay question");
  });

  it("excludes preferred name questions when profile has preferredFirstName", () => {
    const questions: GreenhouseQuestion[] = [
      makeQuestion("Preferred First Name", "question_666", "input_text", [], false),
      makeQuestion("Open-ended question", "question_999", "textarea", [], true),
    ];
    const profile = makeProfile({ preferredFirstName: "Alex" });
    const unanswered = getUnansweredQuestions(questions, profile);
    expect(unanswered).toHaveLength(1);
    expect(unanswered[0].label).toBe("Open-ended question");
  });
});
