import { describe, it, expect } from "vitest";
import { identitySchema } from "../identity-schema";

// Validation lives in a Zod schema exported from the form module so we can
// exercise the rules without spinning up jsdom for the full RHF render tree.
describe("identitySchema", () => {
  it("accepts a normal display name", () => {
    const result = identitySchema.safeParse({ name: "Glenn Fiocca" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const result = identitySchema.safeParse({ name: "   Glenn   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Glenn");
  });

  it("rejects empty strings", () => {
    const result = identitySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects all-whitespace names", () => {
    const result = identitySchema.safeParse({ name: "     " });
    expect(result.success).toBe(false);
  });

  it("accepts an 80-char name (boundary)", () => {
    const name = "a".repeat(80);
    expect(identitySchema.safeParse({ name }).success).toBe(true);
  });

  it("rejects an 81-char name", () => {
    const name = "a".repeat(81);
    expect(identitySchema.safeParse({ name }).success).toBe(false);
  });
});
