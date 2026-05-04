import { describe, it, expect } from "vitest";
import {
  generateEmailChangeToken,
  hashEmailChangeToken,
  safeCompareHashes,
} from "../email-change-token";

describe("generateEmailChangeToken", () => {
  it("returns a 43-char base64url string (32 bytes encoded)", () => {
    const token = generateEmailChangeToken();
    // 32 bytes in base64url with no padding = ceil(32 * 4 / 3) = 43 chars.
    expect(token.length).toBe(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different tokens on each call", () => {
    const a = generateEmailChangeToken();
    const b = generateEmailChangeToken();
    expect(a).not.toBe(b);
  });
});

describe("hashEmailChangeToken", () => {
  it("is deterministic for the same input", () => {
    const t = "fixed-token-value";
    expect(hashEmailChangeToken(t)).toBe(hashEmailChangeToken(t));
  });

  it("returns a 64-char hex string (sha256)", () => {
    const h = hashEmailChangeToken("anything");
    expect(h.length).toBe(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("differs across distinct inputs", () => {
    expect(hashEmailChangeToken("a")).not.toBe(hashEmailChangeToken("b"));
  });
});

describe("safeCompareHashes", () => {
  it("returns true on equal hashes", () => {
    const h = hashEmailChangeToken("token");
    expect(safeCompareHashes(h, h)).toBe(true);
  });

  it("returns false on unequal hashes of equal length", () => {
    const a = hashEmailChangeToken("a");
    const b = hashEmailChangeToken("b");
    expect(safeCompareHashes(a, b)).toBe(false);
  });

  it("returns false on differing lengths (no throw)", () => {
    expect(safeCompareHashes("aa", "bbbb")).toBe(false);
  });
});
