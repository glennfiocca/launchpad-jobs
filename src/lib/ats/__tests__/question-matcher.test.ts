import { describe, it, expect } from "vitest";
import {
  isCoreField,
  autoAnswerQuestion,
  getUnansweredQuestions,
  stripHtml,
} from "../question-matcher";
import type { NormalizedQuestion, NormalizedFieldType } from "../types";
import type { QuestionMatchProfile } from "../question-matcher";

// --- Factories ---

function makeQuestion(
  label: string,
  fieldType: NormalizedFieldType = "text",
  options: Array<{ value: string; label: string }> = [],
  overrides: Partial<NormalizedQuestion> = {}
): NormalizedQuestion {
  return {
    id: `q_${label.replace(/\s+/g, "_").toLowerCase()}`,
    label,
    required: false,
    description: null,
    fieldType,
    ...(options.length > 0 ? { options } : {}),
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<QuestionMatchProfile> = {}
): QuestionMatchProfile {
  return {
    linkedInUrl: null,
    githubUrl: null,
    websiteUrl: null,
    phone: null,
    location: null,
    locationFormatted: null,
    locationState: null,
    currentCompany: null,
    currentTitle: null,
    university: null,
    highestDegree: null,
    preferredFirstName: null,
    sponsorshipRequired: false,
    workAuthorized: true,
    openToRemote: true,
    gender: null,
    race: null,
    veteranStatus: null,
    disability: null,
    ...overrides,
  };
}

// --- isCoreField ---

describe("isCoreField", () => {
  it.each([
    "First Name",
    "Last Name",
    "Email",
    "Email Address",
    "Phone",
    "Phone Number",
    "Resume",
    "Resume / CV",
    "Cover Letter",
  ])("returns true for core field: %s", (label) => {
    expect(isCoreField(makeQuestion(label))).toBe(true);
  });

  it("returns false for Preferred First Name", () => {
    expect(isCoreField(makeQuestion("Preferred First Name"))).toBe(false);
  });

  it("returns false for custom questions", () => {
    expect(isCoreField(makeQuestion("Why do you want this job?"))).toBe(false);
  });

  it("returns false for LinkedIn URL", () => {
    expect(isCoreField(makeQuestion("LinkedIn URL"))).toBe(false);
  });

  it("returns true for Full Name (Ashby)", () => {
    expect(isCoreField(makeQuestion("Full Name"))).toBe(true);
  });

  it("returns false for Company Name (not a person name)", () => {
    expect(isCoreField(makeQuestion("Company Name"))).toBe(false);
  });
});

// --- autoAnswerQuestion ---

describe("autoAnswerQuestion — social links", () => {
  it("returns linkedInUrl for LinkedIn question", () => {
    const q = makeQuestion("LinkedIn URL");
    const profile = makeProfile({ linkedInUrl: "https://linkedin.com/in/jane" });
    expect(autoAnswerQuestion(q, profile)).toBe("https://linkedin.com/in/jane");
  });

  it("returns null when linkedInUrl is not set", () => {
    const q = makeQuestion("LinkedIn Profile");
    const profile = makeProfile({ linkedInUrl: null });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });

  it("returns githubUrl for GitHub question", () => {
    const q = makeQuestion("GitHub Profile");
    const profile = makeProfile({ githubUrl: "https://github.com/jdoe" });
    expect(autoAnswerQuestion(q, profile)).toBe("https://github.com/jdoe");
  });

  it("returns websiteUrl for website/portfolio question", () => {
    const q = makeQuestion("Personal Website");
    const profile = makeProfile({ websiteUrl: "https://jane.dev" });
    expect(autoAnswerQuestion(q, profile)).toBe("https://jane.dev");
  });
});

describe("autoAnswerQuestion — sponsorship", () => {
  it("answers Yes when sponsorship is required", () => {
    const q = makeQuestion("Do you require visa sponsorship?", "select", [
      { value: "1", label: "Yes" },
      { value: "2", label: "No" },
    ]);
    const profile = makeProfile({ sponsorshipRequired: true });
    expect(autoAnswerQuestion(q, profile)).toBe("1");
  });

  it("answers No when sponsorship is not required", () => {
    const q = makeQuestion("Will you need sponsorship?", "select", [
      { value: "1", label: "Yes" },
      { value: "2", label: "No" },
    ]);
    const profile = makeProfile({ sponsorshipRequired: false });
    expect(autoAnswerQuestion(q, profile)).toBe("2");
  });

  it("returns null for sponsorship question without select type", () => {
    const q = makeQuestion("Do you require visa sponsorship?", "text");
    const profile = makeProfile({ sponsorshipRequired: true });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });

  it("answers 'true' for boolean sponsorship when required (Ashby)", () => {
    const q = makeQuestion(
      "Will you now or in the future require Notion to sponsor an immigration case?",
      "boolean"
    );
    const profile = makeProfile({ sponsorshipRequired: true });
    expect(autoAnswerQuestion(q, profile)).toBe("true");
  });

  it("answers 'false' for boolean sponsorship when not required (Ashby)", () => {
    const q = makeQuestion(
      "Will you require sponsorship?",
      "boolean"
    );
    const profile = makeProfile({ sponsorshipRequired: false });
    expect(autoAnswerQuestion(q, profile)).toBe("false");
  });
});

describe("autoAnswerQuestion — work authorization (boolean)", () => {
  it("answers 'true' for boolean work auth when authorized (Ashby)", () => {
    const q = makeQuestion(
      "Are you authorized to work in the United States?",
      "boolean"
    );
    const profile = makeProfile({ workAuthorized: true });
    expect(autoAnswerQuestion(q, profile)).toBe("true");
  });

  it("answers 'false' for boolean work auth when not authorized (Ashby)", () => {
    const q = makeQuestion(
      "Are you authorized to work in the United States?",
      "boolean"
    );
    const profile = makeProfile({ workAuthorized: false });
    expect(autoAnswerQuestion(q, profile)).toBe("false");
  });
});

describe("autoAnswerQuestion — EEOC gender", () => {
  const opts = [
    { value: "101", label: "Male" },
    { value: "102", label: "Female" },
    { value: "103", label: "Decline To Self Identify" },
  ];

  it("matches exact gender", () => {
    const q = makeQuestion("Gender Identity", "select", opts);
    const profile = makeProfile({ gender: "Female" });
    expect(autoAnswerQuestion(q, profile)).toBe("102");
  });

  it("falls back to decline when gender is null", () => {
    const q = makeQuestion("Gender Identity", "select", opts);
    const profile = makeProfile({ gender: null });
    expect(autoAnswerQuestion(q, profile)).toBe("103");
  });

  it("falls back to decline when gender has no match", () => {
    const q = makeQuestion("Gender Identity", "select", opts);
    const profile = makeProfile({ gender: "Non-binary" });
    expect(autoAnswerQuestion(q, profile)).toBe("103");
  });
});

describe("autoAnswerQuestion — EEOC race/ethnicity", () => {
  it("matches race on select type", () => {
    const q = makeQuestion("Race / Ethnicity", "select", [
      { value: "201", label: "White" },
      { value: "202", label: "Black or African American" },
    ]);
    const profile = makeProfile({ race: "White" });
    expect(autoAnswerQuestion(q, profile)).toBe("201");
  });

  it("matches race on multiselect type", () => {
    const q = makeQuestion("Race / Ethnicity", "multiselect", [
      { value: "201", label: "White" },
      { value: "202", label: "Black or African American" },
      { value: "203", label: "Decline To Self Identify" },
    ]);
    const profile = makeProfile({ race: null });
    expect(autoAnswerQuestion(q, profile)).toBe("203");
  });
});

describe("autoAnswerQuestion — preferred first name", () => {
  it("returns preferredFirstName for preferred name question", () => {
    const q = makeQuestion("Preferred First Name", "text");
    const profile = makeProfile({ preferredFirstName: "Alex" });
    expect(autoAnswerQuestion(q, profile)).toBe("Alex");
  });

  it("returns null for preferred name with non-text field type", () => {
    const q = makeQuestion("Preferred First Name", "select", [
      { value: "1", label: "Alex" },
    ]);
    const profile = makeProfile({ preferredFirstName: "Alex" });
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });
});

describe("autoAnswerQuestion — country", () => {
  const countryOpts = [
    { value: "501", label: "United States" },
    { value: "502", label: "Canada" },
  ];

  it("infers US from locationFormatted ending in USA", () => {
    const q = makeQuestion("Country", "select", countryOpts);
    const profile = makeProfile({ locationFormatted: "Austin, TX, USA" });
    expect(autoAnswerQuestion(q, profile)).toBe("501");
  });

  it("infers US from locationState", () => {
    const q = makeQuestion("Country of Residence", "select", countryOpts);
    const profile = makeProfile({ locationState: "CA" });
    expect(autoAnswerQuestion(q, profile)).toBe("501");
  });

  it("returns null when no location data exists", () => {
    const q = makeQuestion("Country", "select", countryOpts);
    const profile = makeProfile();
    expect(autoAnswerQuestion(q, profile)).toBeNull();
  });
});

// --- getUnansweredQuestions ---

describe("getUnansweredQuestions", () => {
  it("excludes core fields", () => {
    const questions = [
      makeQuestion("First Name"),
      makeQuestion("Custom question", "textarea"),
    ];
    const profile = makeProfile();
    const result = getUnansweredQuestions(questions, profile);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Custom question");
  });

  it("excludes auto-answerable questions", () => {
    const questions = [
      makeQuestion("LinkedIn URL"),
      makeQuestion("Open-ended essay", "textarea"),
    ];
    const profile = makeProfile({ linkedInUrl: "https://linkedin.com/in/jane" });
    const result = getUnansweredQuestions(questions, profile);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Open-ended essay");
  });

  it("excludes questions with provided answers", () => {
    const questions = [
      makeQuestion("Custom Q1", "text", [], { id: "q1" }),
      makeQuestion("Custom Q2", "text", [], { id: "q2" }),
    ];
    const profile = makeProfile();
    const result = getUnansweredQuestions(questions, profile, { q1: "answer" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("q2");
  });

  it("returns all custom questions when none are answerable", () => {
    const questions = [
      makeQuestion("Tell us about yourself", "textarea"),
      makeQuestion("Why this role?", "textarea"),
    ];
    const profile = makeProfile();
    const result = getUnansweredQuestions(questions, profile);
    expect(result).toHaveLength(2);
  });
});

// --- Ashby-specific scenarios ---

describe("Ashby question matching — UUID-keyed fields", () => {
  it("auto-answers LinkedIn with UUID id", () => {
    const q = makeQuestion("LinkedIn Profile", "text", [], {
      id: "dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb",
    });
    const profile = makeProfile({ linkedInUrl: "https://linkedin.com/in/jane" });
    expect(autoAnswerQuestion(q, profile)).toBe("https://linkedin.com/in/jane");
  });

  it("LinkedIn with UUID id shows in unanswered when profile has no URL", () => {
    const q = makeQuestion("LinkedIn Profile", "text", [], {
      id: "dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb",
    });
    const profile = makeProfile({ linkedInUrl: null });
    const result = getUnansweredQuestions([q], profile);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb");
  });

  it("LinkedIn with UUID id excluded from unanswered when profile has URL", () => {
    const q = makeQuestion("LinkedIn Profile", "text", [], {
      id: "dbb7e595-3d7b-4a1f-b0b6-76497b74b4cb",
    });
    const profile = makeProfile({ linkedInUrl: "https://linkedin.com/in/jane" });
    const result = getUnansweredQuestions([q], profile);
    expect(result).toHaveLength(0);
  });

  it("Full Name is excluded as core field (Ashby)", () => {
    const q = makeQuestion("Full Name", "text", [], {
      id: "_systemfield_name",
    });
    const result = getUnansweredQuestions([q], makeProfile());
    expect(result).toHaveLength(0);
  });

  it("boolean sponsorship excluded from unanswered when profile set", () => {
    const q = makeQuestion(
      "Will you require Notion to sponsor an immigration case?",
      "boolean",
      [],
      { id: "790b5934-74f5-46f5-897a-675b7f37f2f3" }
    );
    const profile = makeProfile({ sponsorshipRequired: false });
    const result = getUnansweredQuestions([q], profile);
    expect(result).toHaveLength(0);
  });
});

// --- stripHtml ---

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  <span>text</span>  ")).toBe("text");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});
