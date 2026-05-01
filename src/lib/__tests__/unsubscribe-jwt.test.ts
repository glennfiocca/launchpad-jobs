import { describe, it, expect, beforeAll } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../unsubscribe-jwt";

beforeAll(() => {
  // Stable secret for the entire suite — every test goes through the same key.
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-do-not-use-in-prod";
});

describe("unsubscribe JWT", () => {
  describe("sign + verify round trip", () => {
    it("returns userId and type for a valid token", () => {
      const token = signUnsubscribeToken("user-123", "APPLICATION_OFFER");
      const result = verifyUnsubscribeToken(token);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user-123");
      expect(result?.type).toBe("APPLICATION_OFFER");
    });

    it("preserves the userId verbatim through encoding", () => {
      const userId = "user_with-special.chars+123";
      const token = signUnsubscribeToken(userId, "APPLICATION_INTERVIEW");
      const result = verifyUnsubscribeToken(token);

      expect(result?.userId).toBe(userId);
    });
  });

  describe("ALL type", () => {
    it("signs and verifies an ALL-type token", () => {
      const token = signUnsubscribeToken("user-456", "ALL");
      const result = verifyUnsubscribeToken(token);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user-456");
      expect(result?.type).toBe("ALL");
    });
  });

  describe("expiry handling", () => {
    it("returns null for an expired token", () => {
      // TTL of -1s puts exp 1 second in the past — guaranteed expired.
      const token = signUnsubscribeToken("user-789", "APPLICATION_OFFER", -1);
      const result = verifyUnsubscribeToken(token);

      expect(result).toBeNull();
    });

    it("accepts tokens with custom TTL", () => {
      // 10s TTL is well into the future for the test run.
      const token = signUnsubscribeToken("user-789", "APPLICATION_OFFER", 10);
      const result = verifyUnsubscribeToken(token);

      expect(result).not.toBeNull();
    });
  });

  describe("tamper detection", () => {
    it("returns null when the signature is altered", () => {
      const token = signUnsubscribeToken("user-abc", "APPLICATION_OFFER");
      const [header, payload] = token.split(".");
      // Replace the signature with a same-length but wrong value.
      const tampered = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

      expect(verifyUnsubscribeToken(tampered)).toBeNull();
    });

    it("returns null when the payload is modified (signature mismatch)", () => {
      const token = signUnsubscribeToken("user-abc", "APPLICATION_OFFER");
      const [header, , signature] = token.split(".");

      // Forge a payload claiming a different user — signature won't match.
      const forgedPayload = Buffer.from(
        JSON.stringify({
          sub: "attacker",
          iss: "pipeline-unsubscribe",
          aud: "email-recipient",
          type: "ALL",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString("base64url");

      const tampered = `${header}.${forgedPayload}.${signature}`;
      expect(verifyUnsubscribeToken(tampered)).toBeNull();
    });

    it("returns null for malformed tokens", () => {
      expect(verifyUnsubscribeToken("not.a.token")).toBeNull();
      expect(verifyUnsubscribeToken("only-one-part")).toBeNull();
      expect(verifyUnsubscribeToken("")).toBeNull();
    });
  });
});
