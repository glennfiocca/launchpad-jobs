import { describe, it, expect } from "vitest";
import { emailChangeSchema } from "../email-change-schema";

describe("emailChangeSchema", () => {
  it("accepts a valid email", () => {
    const r = emailChangeSchema.safeParse({ newEmail: "user@example.com" });
    expect(r.success).toBe(true);
  });

  it("lowercases the email", () => {
    const r = emailChangeSchema.safeParse({ newEmail: "User@EXAMPLE.com" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe("user@example.com");
  });

  it("trims surrounding whitespace", () => {
    const r = emailChangeSchema.safeParse({ newEmail: "  user@example.com  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe("user@example.com");
  });

  it("rejects empty strings", () => {
    expect(emailChangeSchema.safeParse({ newEmail: "" }).success).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(emailChangeSchema.safeParse({ newEmail: "not-an-email" }).success).toBe(
      false,
    );
    expect(emailChangeSchema.safeParse({ newEmail: "user@" }).success).toBe(false);
    expect(emailChangeSchema.safeParse({ newEmail: "@example.com" }).success).toBe(
      false,
    );
  });

  it("rejects emails over 254 characters", () => {
    const long = `${"a".repeat(250)}@x.io`;
    expect(emailChangeSchema.safeParse({ newEmail: long }).success).toBe(false);
  });
});
