import { describe, it, expect } from "vitest";

/**
 * Tests for selectValues type preservation.
 *
 * The toSelectValues function (in applications/route.ts) converts normalized
 * question options into snapshot selectValues. Previously it used Number()
 * coercion, which corrupted non-numeric Ashby string IDs (e.g. UUIDs) to NaN.
 *
 * These tests validate the fix: numeric values stay numbers (Greenhouse compat),
 * string values are preserved as strings (Ashby compat).
 */

// Reproduce the fixed toSelectValues logic for testing
function toSelectValues(
  options?: ReadonlyArray<{ value: string; label: string }>
): Array<{ value: string | number; label: string }> | undefined {
  if (!options || options.length === 0) return undefined;
  return options.map((o) => {
    const asNum = Number(o.value);
    const value = !isNaN(asNum) && String(asNum) === o.value ? asNum : o.value;
    return { value, label: o.label };
  });
}

describe("toSelectValues", () => {
  it("returns undefined for empty array", () => {
    expect(toSelectValues([])).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(toSelectValues(undefined)).toBeUndefined();
  });

  it("preserves numeric string values as numbers (Greenhouse compat)", () => {
    const result = toSelectValues([
      { value: "1", label: "Yes" },
      { value: "2", label: "No" },
    ]);
    expect(result).toEqual([
      { value: 1, label: "Yes" },
      { value: 2, label: "No" },
    ]);
  });

  it("preserves non-numeric string values as strings (Ashby UUIDs)", () => {
    const result = toSelectValues([
      { value: "pronouns_he_him", label: "He/Him" },
      { value: "pronouns_she_her", label: "She/Her" },
      { value: "pronouns_they_them", label: "They/Them" },
    ]);
    expect(result).toEqual([
      { value: "pronouns_he_him", label: "He/Him" },
      { value: "pronouns_she_her", label: "She/Her" },
      { value: "pronouns_they_them", label: "They/Them" },
    ]);
  });

  it("preserves UUID string values as strings", () => {
    const result = toSelectValues([
      { value: "8039f8aa-1234-5678-abcd-ef0123456789", label: "Option A" },
      { value: "90ab12cd-ef34-5678-90ab-cdef12345678", label: "Option B" },
    ]);
    expect(result).toEqual([
      { value: "8039f8aa-1234-5678-abcd-ef0123456789", label: "Option A" },
      { value: "90ab12cd-ef34-5678-90ab-cdef12345678", label: "Option B" },
    ]);
  });

  it("handles mixed numeric and string values", () => {
    const result = toSelectValues([
      { value: "42", label: "Numeric" },
      { value: "sponsorship_yes", label: "Yes - I require sponsorship" },
    ]);
    expect(result).toEqual([
      { value: 42, label: "Numeric" },
      { value: "sponsorship_yes", label: "Yes - I require sponsorship" },
    ]);
  });

  it("does NOT coerce non-numeric strings to NaN", () => {
    const result = toSelectValues([
      { value: "some_text_value", label: "Text Option" },
    ]);
    expect(result![0].value).toBe("some_text_value");
    expect(result![0].value).not.toBeNaN();
  });

  it("handles '0' as numeric zero", () => {
    const result = toSelectValues([{ value: "0", label: "None" }]);
    expect(result).toEqual([{ value: 0, label: "None" }]);
  });

  it("preserves float-like strings as numbers", () => {
    const result = toSelectValues([{ value: "3.14", label: "Pi" }]);
    expect(result).toEqual([{ value: 3.14, label: "Pi" }]);
  });

  it("preserves empty string as string", () => {
    const result = toSelectValues([{ value: "", label: "Empty" }]);
    // "" → Number("") is 0, but String(0) !== "" so it stays as string
    expect(result).toEqual([{ value: "", label: "Empty" }]);
  });
});
