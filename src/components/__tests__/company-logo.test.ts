import { describe, it, expect, beforeAll } from "vitest";
import { getLogoUrl, normalizeLogoUrl } from "../../lib/logo-url";

const TOKEN = "pub_test_token_123";

beforeAll(() => {
  process.env.NEXT_PUBLIC_LOGO_DEV_KEY = TOKEN;
});

describe("getLogoUrl", () => {
  it("includes theme=dark and retina=true", () => {
    const url = getLogoUrl("https://okta.com");
    expect(url).not.toBeNull();
    const p = new URL(url!);
    expect(p.searchParams.get("theme")).toBe("dark");
    expect(p.searchParams.get("retina")).toBe("true");
  });

  it("uses the hostname as the path", () => {
    const url = getLogoUrl("https://okta.com");
    const p = new URL(url!);
    expect(p.hostname).toBe("img.logo.dev");
    expect(p.pathname).toBe("/okta.com");
  });

  it("strips path and query from the website URL", () => {
    const url = getLogoUrl("https://www.hellofresh.com/careers?ref=1");
    const p = new URL(url!);
    expect(p.pathname).toBe("/www.hellofresh.com");
  });

  it("sets format=png and size=200", () => {
    const url = getLogoUrl("https://doordash.com");
    const p = new URL(url!);
    expect(p.searchParams.get("format")).toBe("png");
    expect(p.searchParams.get("size")).toBe("200");
  });

  it("returns null for an invalid URL", () => {
    expect(getLogoUrl("not-a-url")).toBeNull();
    expect(getLogoUrl("")).toBeNull();
  });
});

describe("normalizeLogoUrl", () => {
  it("adds theme=dark and retina=true to an existing logo.dev URL", () => {
    const old = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png`;
    const updated = normalizeLogoUrl(old);
    const p = new URL(updated);
    expect(p.searchParams.get("theme")).toBe("dark");
    expect(p.searchParams.get("retina")).toBe("true");
  });

  it("preserves existing params", () => {
    const old = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png`;
    const p = new URL(normalizeLogoUrl(old));
    expect(p.searchParams.get("token")).toBe(TOKEN);
    expect(p.searchParams.get("size")).toBe("200");
    expect(p.searchParams.get("format")).toBe("png");
  });

  it("overwrites a conflicting theme=light value", () => {
    const url = `https://img.logo.dev/okta.com?token=${TOKEN}&theme=light`;
    expect(new URL(normalizeLogoUrl(url)).searchParams.get("theme")).toBe("dark");
  });

  it("is idempotent", () => {
    const url = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png`;
    expect(normalizeLogoUrl(normalizeLogoUrl(url))).toBe(normalizeLogoUrl(url));
  });

  it("passes through a non-logo.dev URL unchanged", () => {
    const greenhouse = "https://images.greenhouse.io/logos/okta.png";
    expect(normalizeLogoUrl(greenhouse)).toBe(greenhouse);
  });

  it("passes through an S3 URL unchanged", () => {
    const s3 = "https://s3.amazonaws.com/logos/doordash.png";
    expect(normalizeLogoUrl(s3)).toBe(s3);
  });

  it("passes through a data: URL unchanged", () => {
    const dataUrl = "data:image/png;base64,abc123";
    expect(normalizeLogoUrl(dataUrl)).toBe(dataUrl);
  });
});
