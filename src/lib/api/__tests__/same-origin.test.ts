import { describe, it, expect } from "vitest";
import { isSameOrigin } from "../same-origin";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
  });
}

describe("isSameOrigin", () => {
  it("returns true when Origin host matches Host header", () => {
    expect(
      isSameOrigin(
        makeRequest({
          host: "app.example.com",
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("returns false when Origin host differs from Host header", () => {
    expect(
      isSameOrigin(
        makeRequest({
          host: "app.example.com",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(false);
  });

  it("falls back to Referer host when Origin is missing (same-origin)", () => {
    expect(
      isSameOrigin(
        makeRequest({
          host: "app.example.com",
          referer: "https://app.example.com/some/page",
        }),
      ),
    ).toBe(true);
  });

  it("returns false when Origin and Referer are both missing", () => {
    expect(
      isSameOrigin(
        makeRequest({
          host: "app.example.com",
        }),
      ),
    ).toBe(false);
  });

  it("returns false when Origin is malformed", () => {
    expect(
      isSameOrigin(
        makeRequest({
          host: "app.example.com",
          origin: "not a url",
        }),
      ),
    ).toBe(false);
  });
});
