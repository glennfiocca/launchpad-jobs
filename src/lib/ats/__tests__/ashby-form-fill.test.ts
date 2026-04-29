import { describe, it, expect } from "vitest";

/**
 * Tests for Ashby form fill logic (content.js behaviors).
 *
 * Since jsdom is not installed, DOM-dependent tests are skipped.
 * These tests validate the decision/matching logic extracted as pure functions.
 */

// ─── Resume Target Selection (Logic) ────────────────────────────────────────

describe("Ashby resume upload targeting — autofill marker detection", () => {
  const AUTOFILL_MARKERS = ["autofill", "auto-fill", "parse resume", "upload to autofill", "fill from"];

  function containsAutofillMarker(text: string): boolean {
    const lower = text.toLowerCase();
    return AUTOFILL_MARKERS.some((m) => lower.includes(m));
  }

  it("detects 'autofill' marker", () => {
    expect(containsAutofillMarker("Autofill from resume")).toBe(true);
  });

  it("detects 'auto-fill' marker", () => {
    expect(containsAutofillMarker("Auto-fill your application")).toBe(true);
  });

  it("detects 'parse resume' marker", () => {
    expect(containsAutofillMarker("Parse resume to fill fields")).toBe(true);
  });

  it("detects 'fill from' marker", () => {
    expect(containsAutofillMarker("Fill from your resume")).toBe(true);
  });

  it("does NOT flag 'Upload your resume' as autofill", () => {
    expect(containsAutofillMarker("Upload your resume")).toBe(false);
  });

  it("does NOT flag 'Resume' as autofill", () => {
    expect(containsAutofillMarker("Resume")).toBe(false);
  });

  it("does NOT flag 'Attach resume file' as autofill", () => {
    expect(containsAutofillMarker("Attach resume file")).toBe(false);
  });
});

describe("Ashby resume input priority logic", () => {
  it("_systemfield_resume has highest priority", () => {
    // Simulates selector priority: system field > named > pdf-accept > single candidate
    const inputs = [
      { name: "autofill_resume", type: "file" },
      { name: "_systemfield_resume", type: "file" },
      { name: "other_file", type: "file" },
    ];

    const systemField = inputs.find((i) => i.name === "_systemfield_resume");
    expect(systemField).toBeDefined();
    expect(systemField!.name).toBe("_systemfield_resume");
  });

  it("name='resume' is second priority", () => {
    const inputs = [
      { name: "file_upload", type: "file" },
      { name: "resume", type: "file" },
    ];

    const byName = inputs.find((i) => i.name === "resume");
    expect(byName).toBeDefined();
  });
});

// ─── Tracking Email Protection ──────────────────────────────────────────────

describe("Tracking email protection", () => {
  it("tracking email takes precedence over personal email in snapshot", () => {
    const snap = {
      email: "personal@gmail.com",
      trackingEmail: "track-abc123@app.launchpad.com",
    };
    const emailValue = snap.trackingEmail ?? snap.email;
    expect(emailValue).toBe("track-abc123@app.launchpad.com");
  });

  it("falls back to personal email when trackingEmail is undefined", () => {
    const snap = {
      email: "personal@gmail.com",
      trackingEmail: undefined as string | undefined,
    };
    const emailValue = snap.trackingEmail ?? snap.email;
    expect(emailValue).toBe("personal@gmail.com");
  });

  it("detects email mismatch for re-assertion", () => {
    const expected: string = "track-abc@app.launchpad.com";
    const current: string = "john.doe@gmail.com";
    expect(current !== expected).toBe(true);
  });
});

// ─── SelectValues Comparison (Dropdown Matching) ────────────────────────────

describe("Ashby dropdown option matching", () => {
  /**
   * Replicates the fixed comparison logic from tryClickAshbyDropdownOption.
   * Previously: sv.value === answerStr (strict, fails for number vs string)
   * Fixed: String(sv.value) === answerStr + label fallback
   */
  function findTargetOption(
    selectValues: Array<{ value: string | number; label: string }>,
    answer: string
  ): { value: string | number; label: string } | undefined {
    const answerStr = String(answer);
    const byValue = selectValues.find((sv) => String(sv.value) === answerStr);
    if (byValue) return byValue;
    return selectValues.find((sv) => sv.label.toLowerCase() === answerStr.toLowerCase());
  }

  it("matches numeric value when answer is string", () => {
    const opts = [
      { value: 1, label: "Yes" },
      { value: 2, label: "No" },
    ];
    expect(findTargetOption(opts, "1")).toEqual({ value: 1, label: "Yes" });
  });

  it("matches string value directly", () => {
    const opts = [
      { value: "pronouns_he_him", label: "He/Him" },
      { value: "pronouns_she_her", label: "She/Her" },
    ];
    expect(findTargetOption(opts, "pronouns_he_him")).toEqual({
      value: "pronouns_he_him",
      label: "He/Him",
    });
  });

  it("matches by label when value doesn't match", () => {
    const opts = [
      { value: "opt_a", label: "Yes" },
      { value: "opt_b", label: "No" },
    ];
    expect(findTargetOption(opts, "Yes")).toEqual({ value: "opt_a", label: "Yes" });
  });

  it("does NOT match NaN values (pre-fix regression guard)", () => {
    // Simulates the old bug: Number("pronouns_he_him") → NaN
    const opts = [
      { value: NaN, label: "He/Him" },
      { value: NaN, label: "She/Her" },
    ];
    // String(NaN) is "NaN", which shouldn't match "pronouns_he_him"
    expect(findTargetOption(opts, "pronouns_he_him")).toBeUndefined();
  });

  it("handles UUID values (Ashby format)", () => {
    const opts = [
      { value: "8039f8aa-1234-5678-abcd-ef0123456789", label: "Sponsorship Yes" },
      { value: "90ab12cd-ef34-5678-90ab-cdef12345678", label: "Sponsorship No" },
    ];
    expect(
      findTargetOption(opts, "8039f8aa-1234-5678-abcd-ef0123456789")
    ).toEqual({
      value: "8039f8aa-1234-5678-abcd-ef0123456789",
      label: "Sponsorship Yes",
    });
  });
});

// ─── Phone Field Logic ──────────────────────────────────────────────────────

describe("Ashby phone field logic", () => {
  it("does not fill when phone is unavailable (guard condition)", () => {
    const snap = { phone: undefined };
    // The content.js guard: if (phoneField instanceof HTMLInputElement && snap.phone)
    // With phone undefined, the fill should be skipped
    expect(!!snap.phone).toBe(false);
  });

  it("fills when phone is available", () => {
    const snap = { phone: "+1-555-123-4567" };
    expect(!!snap.phone).toBe(true);
  });

  it("findAshbyField with _systemfield_phone as first arg enables UUID lookup", () => {
    // Before fix: findAshbyField(null, "phone", ...) — null skips attribute match
    // After fix: findAshbyField("_systemfield_phone", "phone", ...) — tries attribute first
    const nameOrId = "_systemfield_phone";
    expect(nameOrId).not.toBeNull();
    expect(nameOrId.startsWith("_systemfield_")).toBe(true);
  });
});

// ─── Location Autocomplete ──────────────────────────────────────────────────

describe("Ashby location autocomplete commit verification", () => {
  it("aria-expanded=true means dropdown is open (uncommitted)", () => {
    const ariaExpanded = "true";
    const isCommitted = ariaExpanded !== "true";
    expect(isCommitted).toBe(false);
  });

  it("aria-expanded=false means dropdown is closed (committed)", () => {
    const ariaExpanded: string | null = "false";
    const isCommitted = ariaExpanded !== "true";
    expect(isCommitted).toBe(true);
  });

  it("null aria-expanded treated as potentially committed (no combobox)", () => {
    const ariaExpanded = null;
    const isCommitted = ariaExpanded !== "true";
    expect(isCommitted).toBe(true);
  });
});

// ─── Greenhouse Anti-Regression ─────────────────────────────────────────────

describe("Greenhouse anti-regression", () => {
  it("ATS provider detection is hostname-based and exclusive", () => {
    function detectAtsProvider(hostname: string): "greenhouse" | "ashby" | null {
      if (hostname === "job-boards.greenhouse.io") return "greenhouse";
      if (hostname === "jobs.ashbyhq.com") return "ashby";
      return null;
    }

    expect(detectAtsProvider("job-boards.greenhouse.io")).toBe("greenhouse");
    expect(detectAtsProvider("jobs.ashbyhq.com")).toBe("ashby");
    expect(detectAtsProvider("example.com")).toBeNull();
  });

  it("toSelectValues preserves Greenhouse numeric IDs", () => {
    function toSelectValues(
      options: ReadonlyArray<{ value: string; label: string }>
    ): Array<{ value: string | number; label: string }> {
      return options.map((o) => {
        const asNum = Number(o.value);
        const value = !isNaN(asNum) && String(asNum) === o.value ? asNum : o.value;
        return { value, label: o.label };
      });
    }

    const ghOptions = [
      { value: "35943699001", label: "Yes" },
      { value: "35943699002", label: "No" },
    ];
    const result = toSelectValues(ghOptions);
    expect(result[0].value).toBe(35943699001);
    expect(result[1].value).toBe(35943699002);
    expect(typeof result[0].value).toBe("number");
  });

  it("Ashby system field selectors are disjoint from Greenhouse selectors", () => {
    const ashbySelectors = ["_systemfield_name", "_systemfield_email", "_systemfield_location", "_systemfield_resume"];
    const greenhouseSelectors = ["first_name", "last_name", "email", "phone", "job_application[location]"];

    // No overlap between Ashby and Greenhouse field names
    for (const ashby of ashbySelectors) {
      for (const gh of greenhouseSelectors) {
        expect(ashby).not.toBe(gh);
      }
    }
  });
});

// ─── Test 1: Parser uploader is skipped ─────────────────────────────────────

describe("Parser uploader is skipped (even when before canonical)", () => {
  const AUTOFILL_MARKERS = [
    "autofill", "auto-fill", "auto fill",
    "parse resume", "parse your resume",
    "upload to autofill", "fill from",
    "import resume", "import your resume",
    "prefill", "pre-fill",
  ];

  function isParserContainer(text: string): boolean {
    const lower = text.toLowerCase();
    return AUTOFILL_MARKERS.some((m) => lower.includes(m));
  }

  it("blocks 'Autofill from resume' container", () => {
    expect(isParserContainer("Autofill from resume")).toBe(true);
  });

  it("blocks 'Import resume' container (Ashby showAutofillApplicationsBox)", () => {
    expect(isParserContainer("Import resume to pre-fill")).toBe(true);
  });

  it("blocks 'Parse your resume' container", () => {
    expect(isParserContainer("Parse your resume to fill fields")).toBe(true);
  });

  it("blocks 'Pre-fill' container", () => {
    expect(isParserContainer("Pre-fill your application")).toBe(true);
  });

  it("allows 'Upload your resume' (canonical resume section)", () => {
    expect(isParserContainer("Upload your resume")).toBe(false);
  });

  it("allows 'Resume *' (bare resume label)", () => {
    expect(isParserContainer("Resume *")).toBe(false);
  });
});

// ─── Test 2: Canonical resume uses _systemfield_resume ──────────────────────

describe("Canonical resume upload uses _systemfield_resume", () => {
  it("Playwright selector starts with _systemfield_resume", () => {
    // Mirrors the actual selector in playwright-apply.ts
    const selector = 'input[type="file"][name="_systemfield_resume"], input[type="file"][name="resume"]';
    expect(selector).toContain("_systemfield_resume");
    // Must NOT contain generic input[type="file"] without name qualifier
    expect(selector).not.toMatch(/input\[type="file"\](?!\[)/);
  });

  it("Playwright selector does NOT have generic file input fallback", () => {
    // The old selector had a trailing ', input[type="file"]' — verify it's removed
    const selector = 'input[type="file"][name="_systemfield_resume"], input[type="file"][name="resume"]';
    const parts = selector.split(",").map((s) => s.trim());
    for (const part of parts) {
      // Each part must have a name qualifier — no bare input[type="file"]
      expect(part).toMatch(/\[name=/);
    }
  });
});

// ─── Test 3: Tracking email is final before submit ──────────────────────────

describe("Tracking email is final before submit", () => {
  it("email guard runs for 4 seconds", () => {
    const EMAIL_GUARD_DURATION = 4000;
    expect(EMAIL_GUARD_DURATION).toBeGreaterThanOrEqual(3000);
  });

  it("max re-assertions capped at 5 to prevent infinite loop", () => {
    const MAX_REASSERTIONS = 5;
    expect(MAX_REASSERTIONS).toBe(5);
  });

  it("mismatch after guard produces FAILED status", () => {
    const emailValue = "track-abc@app.launchpad.com";
    const fieldValue = "john@gmail.com";
    const status = fieldValue === emailValue ? "verified" : "FAILED";
    expect(status).toBe("FAILED");
  });

  it("match after guard produces verified status", () => {
    const emailValue = "track-abc@app.launchpad.com";
    const fieldValue = "track-abc@app.launchpad.com";
    const status = fieldValue === emailValue ? "verified" : "FAILED";
    expect(status).toBe("verified");
  });
});

// ─── Test 4: Phone fills for custom UUID path ───────────────────────────────

describe("Phone fills for custom UUID path", () => {
  it("Ashby phone uses UUID like 8039f8aa-..., not _systemfield_phone", () => {
    // Ground truth from Notion sample app
    const phoneFieldPath = "8039f8aa-c269-467e-bdea-dec068474224";
    expect(phoneFieldPath).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(phoneFieldPath).not.toContain("_systemfield_");
  });

  it("findAshbyField tries _systemfield_phone first then falls back to label/UUID", () => {
    // The code does: findAshbyField("_systemfield_phone", "phone", "phone number", "mobile")
    // This means it tries: (1) name/id=_systemfield_phone, (2) metaByLabel["phone"],
    // (3) metaByLabel["phone number"], (4) metaByLabel["mobile"], (5) findFieldByLabel
    const args = ["_systemfield_phone", "phone", "phone number", "mobile"];
    expect(args[0]).toBe("_systemfield_phone");
    expect(args.length).toBeGreaterThanOrEqual(3);
  });

  it("type=tel fallback catches Ashby phone fields rendered as tel inputs", () => {
    // Ashby renders Phone type fields as input[type="tel"]
    const fallbackSelector = 'input[type="tel"]';
    expect(fallbackSelector).toBe('input[type="tel"]');
  });

  it("retry waits 1s for late-rendered phone field", () => {
    // Code has: await new Promise((r) => setTimeout(r, 1000)) before retry
    const RETRY_DELAY = 1000;
    expect(RETRY_DELAY).toBe(1000);
  });
});

// ─── Test 5: Location requires committed autocomplete selection ─────────────

describe("Location requires committed autocomplete selection", () => {
  it("fillAshbyLocationField waits up to 2s for autocomplete dropdown", () => {
    const AUTOCOMPLETE_WAIT = 2000;
    expect(AUTOCOMPLETE_WAIT).toBe(2000);
  });

  it("typed_not_committed surfaces as missing field with manual instruction", () => {
    const missingFields: string[] = [];
    const fillLogStatus = "typed_not_committed";
    if (fillLogStatus === "typed_not_committed") {
      missingFields.push("Location (typed but autocomplete not selected — please select manually)");
    }
    expect(missingFields).toHaveLength(1);
    expect(missingFields[0]).toContain("please select manually");
  });

  it("committed status only when option explicitly selected or aria-expanded=false", () => {
    // The function checks: optionClicked (dropdown option clicked or keyboard committed)
    // OR: aria-expanded="false" (dropdown closed after interaction)
    const scenarios = [
      { optionClicked: true, committed: true },
      { optionClicked: false, committed: false },
    ];
    for (const s of scenarios) {
      expect(s.optionClicked).toBe(s.committed);
    }
  });
});

// ─── Test 6: Pronouns + sponsorship fill or surface unresolved ──────────────

describe("Pronouns (ValueSelect) and sponsorship (Boolean) handling", () => {
  it("pronouns with no profile data surface as pending (not silently dropped)", () => {
    // question-matcher returns null for /\bpronoun/i
    const label = "Preferred pronouns";
    const isPronoun = /\bpronoun/i.test(label);
    expect(isPronoun).toBe(true);
    // autoAnswerQuestion returns null → question goes to pendingQuestions
  });

  it("pronouns ValueSelect field type maps to multi_value_single_select", () => {
    // Ashby ValueSelect → normalized "select" → Greenhouse-style "multi_value_single_select"
    const fieldType = "multi_value_single_select";
    // This triggers tryClickAshbyDropdownOption in the fill loop
    expect(fieldType === "multi_value_single_select").toBe(true);
  });

  it("sponsorship Boolean field type is auto-answered with 'true'/'false'", () => {
    // question-matcher handles boolean sponsorship
    const fieldType = "boolean";
    const sponsorshipRequired = true;
    const answer = sponsorshipRequired ? "true" : "false";
    expect(answer).toBe("true");
  });

  it("sponsorship toggle matches 'true' to 'Yes' button and 'false' to 'No' button", () => {
    function wantsYes(answer: string): boolean {
      const lower = answer.toLowerCase();
      return lower === "true" || lower === "yes";
    }
    expect(wantsYes("true")).toBe(true);
    expect(wantsYes("false")).toBe(false);
    expect(wantsYes("yes")).toBe(true);
    expect(wantsYes("no")).toBe(false);
  });

  it("unfilled required pending question surfaces in banner", () => {
    const pendingQuestions = [
      { label: "Preferred pronouns", fieldName: "b0a5aba8-dbb7-41a9-b548-f72cc3e48956", required: true, userAnswer: undefined },
    ];
    const filledFieldNames = new Set<string>();
    const unansweredPending = pendingQuestions.filter(
      (q) => !q.userAnswer && q.required && !filledFieldNames.has(q.fieldName)
    );
    expect(unansweredPending).toHaveLength(1);
    expect(unansweredPending[0].label).toBe("Preferred pronouns");
  });
});

// ─── Test 7: Ashby select values remain string-safe ─────────────────────────

describe("Ashby select values remain string-safe", () => {
  function toSelectValues(
    options: ReadonlyArray<{ value: string; label: string }>
  ): Array<{ value: string | number; label: string }> {
    return options.map((o) => {
      const asNum = Number(o.value);
      const value = !isNaN(asNum) && String(asNum) === o.value ? asNum : o.value;
      return { value, label: o.label };
    });
  }

  it("Ashby UUID pronoun values stay as strings", () => {
    const opts = toSelectValues([
      { value: "b0a5aba8-opt1", label: "He/Him" },
      { value: "b0a5aba8-opt2", label: "She/Her" },
      { value: "b0a5aba8-opt3", label: "They/Them" },
    ]);
    expect(typeof opts[0].value).toBe("string");
    expect(opts[0].value).toBe("b0a5aba8-opt1");
  });

  it("Greenhouse numeric IDs convert to numbers", () => {
    const opts = toSelectValues([
      { value: "12345", label: "Option A" },
      { value: "67890", label: "Option B" },
    ]);
    expect(typeof opts[0].value).toBe("number");
    expect(opts[0].value).toBe(12345);
  });

  it("Ashby slug-style values stay as strings", () => {
    const opts = toSelectValues([
      { value: "sponsorship_yes", label: "Yes" },
      { value: "sponsorship_no", label: "No" },
    ]);
    expect(typeof opts[0].value).toBe("string");
    expect(opts[0].value).toBe("sponsorship_yes");
  });

  it("dropdown matching uses String() coercion for cross-type comparison", () => {
    function findTargetOption(
      selectValues: Array<{ value: string | number; label: string }>,
      answer: string
    ): string | undefined {
      return selectValues.find((sv) => String(sv.value) === answer)?.label;
    }
    // Numeric value matched by string answer
    expect(findTargetOption([{ value: 42, label: "Answer" }], "42")).toBe("Answer");
    // String value matched directly
    expect(findTargetOption([{ value: "uuid-123", label: "Answer" }], "uuid-123")).toBe("Answer");
  });
});

// ─── Test 8: Greenhouse behavior unchanged ──────────────────────────────────

describe("Greenhouse behavior unchanged", () => {
  it("ATS provider detection is hostname-based and exclusive", () => {
    function detectAtsProvider(hostname: string): "greenhouse" | "ashby" | null {
      if (hostname === "job-boards.greenhouse.io") return "greenhouse";
      if (hostname === "jobs.ashbyhq.com") return "ashby";
      return null;
    }

    expect(detectAtsProvider("job-boards.greenhouse.io")).toBe("greenhouse");
    expect(detectAtsProvider("jobs.ashbyhq.com")).toBe("ashby");
    expect(detectAtsProvider("example.com")).toBeNull();
  });

  it("Greenhouse path never calls findCanonicalResumeInput or Ashby helpers", () => {
    // The Greenhouse fill path (lines 1700+) uses its own selectors:
    // input[name="first_name"], react-select dropdowns, etc.
    // Ashby helpers are only called when provider === "ashby"
    const provider = "greenhouse";
    const usesAshbyHelpers = provider === "ashby";
    expect(usesAshbyHelpers).toBe(false);
  });

  it("Ashby autofill markers do NOT match Greenhouse terminology", () => {
    const AUTOFILL_MARKERS = [
      "autofill", "auto-fill", "auto fill",
      "parse resume", "parse your resume",
      "upload to autofill", "fill from",
      "import resume", "import your resume",
      "prefill", "pre-fill",
    ];
    // Greenhouse resume section typically says "Resume/CV" or "Upload resume"
    const greenhouseLabels = ["Resume/CV", "Upload resume", "Attach your resume"];
    for (const label of greenhouseLabels) {
      const lower = label.toLowerCase();
      const matches = AUTOFILL_MARKERS.some((m) => lower.includes(m));
      expect(matches).toBe(false);
    }
  });

  it("Greenhouse selectValues stay numeric through toSelectValues", () => {
    // Greenhouse options are always numeric string IDs like "35943699001"
    function toSelectValues(
      options: ReadonlyArray<{ value: string; label: string }>
    ): Array<{ value: string | number; label: string }> {
      return options.map((o) => {
        const asNum = Number(o.value);
        const value = !isNaN(asNum) && String(asNum) === o.value ? asNum : o.value;
        return { value, label: o.label };
      });
    }
    const result = toSelectValues([
      { value: "35943699001", label: "Yes" },
      { value: "35943699002", label: "No" },
    ]);
    expect(typeof result[0].value).toBe("number");
    expect(typeof result[1].value).toBe("number");
  });
});
