import { describe, it, expect, beforeAll } from "vitest";
import { getLogoUrl, normalizeLogoUrl } from "../../lib/logo-url";

const TOKEN = "pub_test_token_123";

beforeAll(() => {
  process.env.NEXT_PUBLIC_LOGO_DEV_KEY = TOKEN;
});

describe("getLogoUrl", () => {
  it("builds a bare logo.dev URL with token + retina only", () => {
    const url = getLogoUrl("https://okta.com");
    expect(url).not.toBeNull();
    const p = new URL(url!);
    expect(p.searchParams.get("token")).toBe(TOKEN);
    expect(p.searchParams.get("retina")).toBe("true");
    // Stripped: format/theme/size are deliberately absent so logo.dev
    // returns its default JPEG variant (white-plate).
    expect(p.searchParams.get("format")).toBeNull();
    expect(p.searchParams.get("theme")).toBeNull();
    expect(p.searchParams.get("size")).toBeNull();
  });

  it("includes fallback=monogram so non-covered brands render a placeholder (B.5)", () => {
    // Track B.5 of HARDENING_PLAN.md: brands without logo.dev coverage
    // should render a monogram-style placeholder rather than 404. The
    // `fallback=monogram` query param is the documented logo.dev escape
    // hatch.
    const url = getLogoUrl("https://nonexistent-brand-xyz.example");
    const p = new URL(url!);
    expect(p.searchParams.get("fallback")).toBe("monogram");
  });

  it("uses the hostname as the path", () => {
    const url = getLogoUrl("https://okta.com");
    const p = new URL(url!);
    expect(p.hostname).toBe("img.logo.dev");
    expect(p.pathname).toBe("/okta.com");
  });

  it("preserves the www-prefixed hostname verbatim", () => {
    const url = getLogoUrl("https://www.hellofresh.com/careers?ref=1");
    const p = new URL(url!);
    expect(p.pathname).toBe("/www.hellofresh.com");
  });

  it("returns null for an invalid URL", () => {
    expect(getLogoUrl("not-a-url")).toBeNull();
    expect(getLogoUrl("")).toBeNull();
  });
});

describe("normalizeLogoUrl", () => {
  it("strips legacy theme/format/size params from stored logo.dev URLs", () => {
    const old = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png&theme=dark`;
    const updated = normalizeLogoUrl(old);
    const p = new URL(updated);
    expect(p.searchParams.get("theme")).toBeNull();
    expect(p.searchParams.get("format")).toBeNull();
    expect(p.searchParams.get("size")).toBeNull();
    expect(p.searchParams.get("retina")).toBe("true");
  });

  it("preserves the token", () => {
    const old = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png`;
    const p = new URL(normalizeLogoUrl(old));
    expect(p.searchParams.get("token")).toBe(TOKEN);
  });

  it("is idempotent", () => {
    const url = `https://img.logo.dev/okta.com?token=${TOKEN}&size=200&format=png`;
    expect(normalizeLogoUrl(normalizeLogoUrl(url))).toBe(normalizeLogoUrl(url));
  });

  it("passes through a non-logo.dev URL unchanged", () => {
    const greenhouse = "https://images.greenhouse.io/logos/okta.png";
    expect(normalizeLogoUrl(greenhouse)).toBe(greenhouse);
  });

  it("passes through a Spaces CDN URL unchanged", () => {
    const spaces = "https://pipeline-uploads.nyc3.digitaloceanspaces.com/logos/manual/okta.jpg";
    expect(normalizeLogoUrl(spaces)).toBe(spaces);
  });

  it("passes through a data: URL unchanged", () => {
    const dataUrl = "data:image/png;base64,abc123";
    expect(normalizeLogoUrl(dataUrl)).toBe(dataUrl);
  });

  it("preserves fallback=monogram when present (B.5)", () => {
    const url = `https://img.logo.dev/okta.com?token=${TOKEN}&retina=true&fallback=monogram`;
    const p = new URL(normalizeLogoUrl(url));
    expect(p.searchParams.get("fallback")).toBe("monogram");
  });
});
