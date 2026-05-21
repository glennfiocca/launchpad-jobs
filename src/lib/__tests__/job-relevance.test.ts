import { describe, it, expect } from "vitest";
import {
  buildRelevanceOrder,
  buildBlendedRelevanceOrder,
  buildRelevanceScoreSql,
  computeMaxRawScore,
  hasProfileSignals,
} from "../job-relevance";
import type { RelevanceProfile } from "../job-relevance";

// Empty/default profile — no scoring signals. New optional fields stay
// undefined so we can prove backwards-compat for partial callers.
const EMPTY_PROFILE: RelevanceProfile = {
  locationCity: null,
  locationState: null,
  openToRemote: false,
  openToOnsite: false,
  currentTitle: null,
  fieldOfStudy: null,
  desiredSalaryMin: null,
  desiredSalaryMax: null,
  targetRoles: [],
  desiredEmploymentTypes: [],
};

// Helper that overrides only the fields under test.
function profile(overrides: Partial<RelevanceProfile>): RelevanceProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("hasProfileSignals", () => {
  it("returns false for null", () => {
    expect(hasProfileSignals(null)).toBe(false);
  });

  it("returns false for an empty profile", () => {
    expect(hasProfileSignals(EMPTY_PROFILE)).toBe(false);
  });

  it("returns false when only currentTitle/fieldOfStudy are set", () => {
    // Regression guard: identity fields are no longer scoring signals
    // because their per-row ts_rank evaluation was the dominant cost.
    expect(
      hasProfileSignals(
        profile({ currentTitle: "Software Engineer", fieldOfStudy: "CS" })
      )
    ).toBe(false);
  });

  it("returns true when locationCity is set", () => {
    expect(hasProfileSignals(profile({ locationCity: "NYC" }))).toBe(true);
  });

  it("returns true when locationState is set", () => {
    expect(hasProfileSignals(profile({ locationState: "NY" }))).toBe(true);
  });

  it("returns true when openToRemote is true", () => {
    expect(hasProfileSignals(profile({ openToRemote: true }))).toBe(true);
  });

  it("returns true when openToHybrid is true", () => {
    expect(hasProfileSignals(profile({ openToHybrid: true }))).toBe(true);
  });

  it("returns true when openToOnsite is true", () => {
    expect(hasProfileSignals(profile({ openToOnsite: true }))).toBe(true);
  });

  it("returns true when desiredSalaryMin is set (including 0)", () => {
    expect(hasProfileSignals(profile({ desiredSalaryMin: 0 }))).toBe(true);
    expect(hasProfileSignals(profile({ desiredSalaryMin: 100000 }))).toBe(true);
  });

  it("returns true when desiredSalaryMax is set", () => {
    expect(hasProfileSignals(profile({ desiredSalaryMax: 200000 }))).toBe(true);
  });

  it("returns true when skillNames is non-empty (P0 #2)", () => {
    expect(hasProfileSignals(profile({ skillNames: ["python"] }))).toBe(true);
  });

  it("returns true when yearsExperience is set (including 0)", () => {
    // 0 years still derives an entry-level slug and a meaningful penalty
    // signal — must count as a profile signal, not be treated as null.
    expect(hasProfileSignals(profile({ yearsExperience: 0 }))).toBe(true);
    expect(hasProfileSignals(profile({ yearsExperience: 5 }))).toBe(true);
  });
});

describe("buildRelevanceOrder", () => {
  it("falls back to recency when profile has no signals", () => {
    const sql = buildRelevanceOrder(EMPTY_PROFILE).sql;
    expect(sql).toContain('"createdAt"');
    expect(sql).not.toContain("ts_rank");
    expect(sql).not.toContain("LIKE");
  });

  it("falls back to recency when only identity fields are set", () => {
    // currentTitle/fieldOfStudy alone no longer trigger profile scoring.
    const sql = buildRelevanceOrder(
      profile({ currentTitle: "Engineer", fieldOfStudy: "CS" })
    ).sql;
    expect(sql).toContain('"createdAt"');
    expect(sql).not.toContain("ts_rank");
  });

  it("uses word-boundary regex (not LIKE) when only city is set (P0 #5)", () => {
    const order = buildRelevanceOrder(profile({ locationCity: "Austin" }));
    // New: ~* with \m...\M, not LIKE %...%.
    expect(order.sql).toContain("~*");
    expect(order.sql).not.toContain("LIKE");
    // The bound parameter wraps the value in word-boundary anchors.
    expect(order.values).toContain("\\mAustin\\M");
  });

  it("does NOT contain identity-field ts_rank even with full profile (B1 regression guard)", () => {
    const fullProfile = profile({
      locationCity: "Austin",
      locationState: "TX",
      openToRemote: true,
      openToOnsite: false,
      currentTitle: "Senior Software Engineer",
      fieldOfStudy: "Computer Science",
      desiredSalaryMin: 120000,
      desiredSalaryMax: 200000,
    });
    const order = buildRelevanceOrder(fullProfile);
    // Bug B1: per-row ts_rank against currentTitle+fieldOfStudy stays dropped.
    // (Note: ts_rank may still appear for skills — that's intentional P0 #2.)
    expect(order.values).not.toContain("Senior Software Engineer");
    expect(order.values).not.toContain("Computer Science");
    expect(order.values).not.toContain("Senior Software Engineer Computer Science");
    // Structural signals still present.
    expect(order.sql).toContain("~*");
    // workMode replaces legacy j."remote" bool (P0 #4).
    expect(order.sql).toContain('"workMode"');
    expect(order.sql).toContain('"salaryMax"');
    expect(order.sql).toContain('"salaryMin"');
  });
});

describe("buildBlendedRelevanceOrder", () => {
  it("preserves ts_rank * 30 for the FTS path with full profile", () => {
    const fullProfile = profile({
      locationCity: "NYC",
      locationState: "NY",
      currentTitle: "Engineer",
      fieldOfStudy: "CS",
      desiredSalaryMin: 100000,
    });
    const order = buildBlendedRelevanceOrder("react developer", fullProfile);
    // FTS rank is legitimate here — uses the user's real query.
    expect(order.sql).toContain("ts_rank");
    expect(order.sql).toContain("* 30");
    // Profile structural signals should still be appended.
    expect(order.sql).toContain("~*");
    // The identity-derived ts_rank * 40 fragment must NOT be present.
    expect(order.sql).not.toContain("* 40");
    // The user's query is bound as a parameter.
    expect(order.values).toContain("react developer");
  });

  it("does not bind currentTitle/fieldOfStudy as ts_rank input", () => {
    const fullProfile = profile({
      currentTitle: "Senior Engineer",
      fieldOfStudy: "Computer Science",
    });
    const order = buildBlendedRelevanceOrder("python", fullProfile);
    expect(order.values).not.toContain("Senior Engineer");
    expect(order.values).not.toContain("Computer Science");
    expect(order.values).not.toContain("Senior Engineer Computer Science");
  });
});

// ─── P0 #1: language gating ──────────────────────────────────────────────────

describe("P0 #1 — language gate (requiredLanguages × spokenLanguages)", () => {
  it("emits a -40 penalty branch keyed off j.requiredLanguages overlap", () => {
    const p = profile({
      locationCity: "Austin",
      spokenLanguages: ["english"],
    });
    const sql = buildRelevanceScoreSql(p).sql;
    // The penalty math wraps the score in GREATEST(0, raw - penalty).
    expect(sql).toContain("GREATEST(0");
    expect(sql).toContain('"requiredLanguages"');
    expect(sql).toContain("&&"); // overlap operator
    // The penalty constant (40) is bound as a value.
    expect(buildRelevanceScoreSql(p).values).toContain(40);
  });

  it("user lacks Spanish vs job that requires Spanish — penalty fires (overlap=false)", () => {
    // We can't actually run the SQL here, but we can prove the expression
    // contains the user's language array as a bound param and the overlap
    // operator. At runtime, ["english"] && ["spanish"] = false → -40 fires.
    const p = profile({
      locationCity: "Austin",
      spokenLanguages: ["english"],
    });
    const built = buildRelevanceScoreSql(p);
    // The user's spoken-language array is parameterised verbatim.
    expect(built.values).toContainEqual(["english"]);
  });

  it("user with Mandarin matches job requiring Mandarin — overlap=true, no penalty", () => {
    const p = profile({
      locationCity: "Austin",
      spokenLanguages: ["english", "mandarin"],
    });
    const built = buildRelevanceScoreSql(p);
    expect(built.values).toContainEqual(["english", "mandarin"]);
    // Penalty CASE still emits but evaluates to 0 when overlap holds.
    expect(built.sql).toContain("&&");
  });

  it("language penalty does NOT add to computeMaxRawScore ceiling", () => {
    const p = profile({
      locationCity: "Austin",
      spokenLanguages: ["english"],
    });
    // Only city (25) + recency (15) — language penalty doesn't inflate the
    // denominator, only the numerator (via GREATEST floor).
    expect(computeMaxRawScore(p)).toBe(25 + 15);
  });
});

// ─── P0 #2: skills ts_rank ──────────────────────────────────────────────────

describe("P0 #2 — skills ts_rank against Job.searchVector", () => {
  it("emits a ts_rank component when skillNames is non-empty", () => {
    const p = profile({ skillNames: ["python", "react"] });
    const built = buildRelevanceScoreSql(p);
    expect(built.sql).toContain("ts_rank");
    expect(built.sql).toContain("to_tsquery");
    expect(built.sql).toContain('"searchVector"');
    // The OR-joined tsquery surfaces as a bound value.
    expect(built.values).toContain("python | react");
  });

  it("multi-word skill becomes a parenthesised AND-phrase chunk", () => {
    const p = profile({ skillNames: ["node js", "react"] });
    const built = buildRelevanceScoreSql(p);
    expect(built.values).toContain("(node & js) | react");
  });

  it("punctuation-only skill is dropped (no empty tokens leak into tsquery)", () => {
    const p = profile({ skillNames: ["++", "python"] });
    const built = buildRelevanceScoreSql(p);
    expect(built.values).toContain("python");
  });

  it("computeMaxRawScore adds +30 ceiling when skillNames is non-empty", () => {
    const baseline = computeMaxRawScore(profile({ locationCity: "Austin" }));
    const withSkills = computeMaxRawScore(
      profile({ locationCity: "Austin", skillNames: ["python"] })
    );
    expect(withSkills - baseline).toBe(30);
  });

  it("does NOT emit ts_rank when skillNames is empty", () => {
    const p = profile({ locationCity: "Austin", skillNames: [] });
    const built = buildRelevanceScoreSql(p);
    expect(built.sql).not.toContain("to_tsquery");
  });
});

// ─── P0 #3: experience-level distance penalty ──────────────────────────────

describe("P0 #3 — yearsExperience → level distance penalty", () => {
  it("emits an array_position-driven CASE when yearsExperience is set", () => {
    const p = profile({ locationCity: "Austin", yearsExperience: 0 });
    const built = buildRelevanceScoreSql(p);
    expect(built.sql).toContain("array_position");
    expect(built.sql).toContain('"experienceLevel"');
  });

  it("does NOT emit the level-penalty CASE when yearsExperience is null", () => {
    const p = profile({ locationCity: "Austin", yearsExperience: null });
    const built = buildRelevanceScoreSql(p);
    expect(built.sql).not.toContain("array_position");
  });

  it("0-yr user → entry slug index (binds penalty constants 5 and 15)", () => {
    const p = profile({ yearsExperience: 0, locationCity: "Austin" });
    const built = buildRelevanceScoreSql(p);
    expect(built.values).toContain(5);
    expect(built.values).toContain(15);
  });

  it("penalty does NOT add to computeMaxRawScore ceiling", () => {
    const baseline = computeMaxRawScore(profile({ locationCity: "Austin" }));
    const withYears = computeMaxRawScore(
      profile({ locationCity: "Austin", yearsExperience: 0 })
    );
    // Years experience doesn't inflate the ceiling — penalty-only signal.
    expect(withYears).toBe(baseline);
  });
});

// ─── P0 #4: workMode replaces legacy j.remote bool ─────────────────────────

describe("P0 #4 — workMode-aware preference branching", () => {
  it("openToRemote=true → CASE WHEN j.workMode = 'remote' THEN 20", () => {
    const p = profile({ openToRemote: true });
    const sql = buildRelevanceScoreSql(p).sql;
    expect(sql).toContain('"workMode" = \'remote\'');
    expect(buildRelevanceScoreSql(p).values).toContain(20);
  });

  it("openToHybrid=true → CASE WHEN j.workMode = 'hybrid' THEN 15", () => {
    const p = profile({ openToHybrid: true });
    const sql = buildRelevanceScoreSql(p).sql;
    expect(sql).toContain('"workMode" = \'hybrid\'');
    expect(buildRelevanceScoreSql(p).values).toContain(15);
  });

  it("openToOnsite=true → CASE WHEN j.workMode = 'onsite' THEN 10", () => {
    const p = profile({ openToOnsite: true });
    const sql = buildRelevanceScoreSql(p).sql;
    expect(sql).toContain('"workMode" = \'onsite\'');
    expect(buildRelevanceScoreSql(p).values).toContain(10);
  });

  it("does NOT reference legacy j.remote boolean column", () => {
    const p = profile({
      openToRemote: true,
      openToHybrid: true,
      openToOnsite: true,
    });
    const sql = buildRelevanceScoreSql(p).sql;
    // legacy column name `"remote"` (the bool) must not appear.
    expect(sql).not.toMatch(/j\."remote"/);
  });

  it("computeMaxRawScore takes the max weight across remote/hybrid/onsite", () => {
    // Only one branch fires per row — ceiling = largest weight present.
    expect(
      computeMaxRawScore(profile({ openToHybrid: true, openToOnsite: true }))
    ).toBe(15 + 15); // hybrid (15) + recency (15)
    expect(
      computeMaxRawScore(profile({ openToRemote: true, openToOnsite: true }))
    ).toBe(20 + 15); // remote (20) wins + recency
  });
});

// ─── P0 #5: word-boundary regex on city + targetRoles ──────────────────────

describe("P0 #5 — word-boundary regex prevents substring false positives", () => {
  it("locationCity 'NY' binds as \\mNY\\M regex (not %NY% LIKE pattern)", () => {
    // Regression: "NY" inside a LIKE %NY% pattern matched "Sunnyvale".
    // New \m...\M anchors mean Postgres only matches whole-word "NY".
    const built = buildRelevanceScoreSql(profile({ locationCity: "NY" }));
    expect(built.values).toContain("\\mNY\\M");
    expect(built.values).not.toContain("%NY%");
    expect(built.sql).not.toContain("LIKE");
  });

  it("targetRoles 'engineer' binds as \\mengineer\\M (not %engineer%)", () => {
    // Regression: "engineer" inside %engineer% LIKE matched "Reverse Engineer".
    // New \m...\M anchor means only whole-word "engineer" matches the title.
    const built = buildRelevanceScoreSql(profile({ targetRoles: ["engineer"] }));
    expect(built.values).toContain("\\mengineer\\M");
    expect(built.values).not.toContain("%engineer%");
  });

  it("escapes regex metacharacters in user input (no SQL injection / regex break)", () => {
    // A user with a paren in their city name shouldn't crash the regex.
    const built = buildRelevanceScoreSql(profile({ locationCity: "St. Louis (MO)" }));
    expect(built.values).toContain("\\mSt\\. Louis \\(MO\\)\\M");
  });
});

// ─── P0 #6: employment-type variant normalization ──────────────────────────

describe("P0 #6 — employment-type slug → DB variant expansion", () => {
  it("'full-time' slug expands to the full DB variant array", () => {
    const built = buildRelevanceScoreSql(
      profile({ desiredEmploymentTypes: ["full-time"] })
    );
    // The expanded variant list is bound as one parameter.
    const fullTimeVariants = built.values.find(
      (v): v is string[] => Array.isArray(v) && v.includes("Full-time")
    );
    expect(fullTimeVariants).toBeDefined();
    expect(fullTimeVariants).toEqual(
      expect.arrayContaining(["Full-time", "Full Time", "Full-Time", "FULL_TIME"])
    );
  });

  it("'internship' slug expands to multiple casing variants", () => {
    const built = buildRelevanceScoreSql(
      profile({ desiredEmploymentTypes: ["internship"] })
    );
    const internVariants = built.values.find(
      (v): v is string[] => Array.isArray(v) && v.includes("Internship")
    );
    expect(internVariants).toBeDefined();
    expect(internVariants).toEqual(
      expect.arrayContaining(["Internship", "Intern", "INTERN"])
    );
  });

  it("unknown slug falls through verbatim (no zero-match)", () => {
    const built = buildRelevanceScoreSql(
      profile({ desiredEmploymentTypes: ["volunteer"] })
    );
    const passThrough = built.values.find(
      (v): v is string[] => Array.isArray(v) && v.includes("volunteer")
    );
    expect(passThrough).toBeDefined();
  });
});

// ─── P0 #7: resumeExtracted fallback for currentTitle/yearsExperience ──────

describe("P0 #7 — RelevanceProfile carries resume-extracted fallbacks", () => {
  // The fallback resolution happens in api/jobs/route.ts before the profile
  // reaches buildRelevanceScoreSql. We exercise the consumer side here:
  // when yearsExperience comes through the optional field, the penalty is
  // wired in regardless of where it originated.
  it("yearsExperience supplied via the optional field still drives the penalty", () => {
    const p = profile({
      locationCity: "Austin",
      yearsExperience: 7, // would come from resumeExtracted when scalar is null
    });
    const built = buildRelevanceScoreSql(p);
    expect(built.sql).toContain("array_position");
  });

  it("missing yearsExperience (undefined) emits no level penalty", () => {
    // The api/jobs/route.ts construction defaults to null when both are
    // absent; the matcher must treat null + undefined identically.
    const undef = profile({ locationCity: "Austin" });
    const built = buildRelevanceScoreSql(undef);
    expect(built.sql).not.toContain("array_position");
  });
});
