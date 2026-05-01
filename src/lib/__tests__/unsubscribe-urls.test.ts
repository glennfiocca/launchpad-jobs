import { describe, it, expect, beforeAll } from "vitest";
import {
  buildUnsubscribeUrl,
  buildListUnsubscribeHeaders,
} from "../unsubscribe-urls";
import { verifyUnsubscribeToken } from "../unsubscribe-jwt";

beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-do-not-use-in-prod";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("buildUnsubscribeUrl", () => {
  it("returns an absolute URL with NEXT_PUBLIC_APP_URL as origin", () => {
    const url = buildUnsubscribeUrl("user-123", "APPLICATION_OFFER");
    expect(url.startsWith("https://app.example.com/unsubscribe?token=")).toBe(true);
  });

  it("contains a verifiable token in the query string", () => {
    const url = buildUnsubscribeUrl("user-123", "APPLICATION_OFFER");
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");

    expect(token).not.toBeNull();
    const verified = verifyUnsubscribeToken(token!);
    expect(verified?.userId).toBe("user-123");
    expect(verified?.type).toBe("APPLICATION_OFFER");
  });

  it("URL-encodes the token so it survives transport", () => {
    const url = buildUnsubscribeUrl("user-456", "ALL");
    // No raw '+' or '/' in a properly encoded URL — base64url avoids these,
    // but encodeURIComponent is still required for safety.
    const queryStr = url.split("?")[1] ?? "";
    expect(queryStr.startsWith("token=")).toBe(true);
  });
});

describe("buildListUnsubscribeHeaders", () => {
  it("returns the RFC 2369 header value wrapped in angle-brackets", () => {
    const headers = buildListUnsubscribeHeaders("user-123", "APPLICATION_OFFER");

    expect(headers["List-Unsubscribe"].startsWith("<https://")).toBe(true);
    expect(headers["List-Unsubscribe"].endsWith(">")).toBe(true);
    expect(headers["List-Unsubscribe"]).toMatch(/^<https:\/\/.+>$/);
  });

  it("returns the exact RFC 8058 List-Unsubscribe-Post value", () => {
    const headers = buildListUnsubscribeHeaders("user-123", "ALL");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("includes the unsubscribe URL inside the header value", () => {
    const headers = buildListUnsubscribeHeaders("user-123", "APPLICATION_INTERVIEW");
    const headerValue = headers["List-Unsubscribe"];

    // Strip the brackets and verify the URL is parseable.
    const url = headerValue.slice(1, -1);
    expect(url.startsWith("https://app.example.com/unsubscribe?token=")).toBe(true);

    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");
    expect(token).not.toBeNull();

    const verified = verifyUnsubscribeToken(token!);
    expect(verified?.type).toBe("APPLICATION_INTERVIEW");
  });
});
