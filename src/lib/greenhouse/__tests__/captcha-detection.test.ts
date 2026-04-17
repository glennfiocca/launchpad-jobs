import { describe, it, expect } from "vitest";
import {
  detectCaptchaInHtml,
  CAPTCHA_INDICATOR_PATTERNS,
} from "../playwright-apply";

describe("detectCaptchaInHtml", () => {
  it("returns false for a normal Greenhouse application page", () => {
    const html = `
      <html>
        <body>
          <form id="application-form">
            <input name="first_name" />
            <input name="last_name" />
            <button type="submit">Submit Application</button>
          </form>
        </body>
      </html>
    `;
    expect(detectCaptchaInHtml(html)).toBe(false);
  });

  it("detects reCAPTCHA script tag", () => {
    const html = `<script src="https://www.google.com/recaptcha/api.js"></script>`;
    expect(detectCaptchaInHtml(html)).toBe(true);
  });

  it("detects hCaptcha widget attribute", () => {
    const html = `<div class="h-captcha" data-sitekey="abc123"></div>`;
    expect(detectCaptchaInHtml(html)).toBe(true);
  });

  it("detects Cloudflare Turnstile widget", () => {
    const html = `<div class="cf-turnstile" data-sitekey="xyz"></div>`;
    expect(detectCaptchaInHtml(html)).toBe(true);
  });

  it("detects Cloudflare classic challenge", () => {
    const html = `<div id="cf_challenge_form">challenge content</div>`;
    expect(detectCaptchaInHtml(html)).toBe(true);
  });

  it("detects 'are you a robot' text (case-insensitive)", () => {
    expect(detectCaptchaInHtml("Are You a Robot?")).toBe(true);
    expect(detectCaptchaInHtml("ARE YOU A ROBOT")).toBe(true);
  });

  it("detects 'verify you are human' text", () => {
    expect(detectCaptchaInHtml("Please verify you are human")).toBe(true);
  });

  it("detects 'prove you're not a robot' text", () => {
    expect(detectCaptchaInHtml("Prove you're not a robot")).toBe(true);
    expect(detectCaptchaInHtml("Prove youre not a robot")).toBe(true);
  });

  it("detects 'human verification' text", () => {
    expect(detectCaptchaInHtml("Complete human verification to continue")).toBe(
      true
    );
  });

  it("detects 'bot detection' text", () => {
    expect(detectCaptchaInHtml("Bot detection system active")).toBe(true);
  });

  it("does not false-positive on 'robot' alone", () => {
    // "robot" alone is fine; the full phrase is needed
    expect(detectCaptchaInHtml("This job is perfect for a robot lover")).toBe(
      false
    );
  });

  it("does not false-positive on 'human' alone", () => {
    expect(detectCaptchaInHtml("Looking for a human touch in your work?")).toBe(
      false
    );
  });
});

describe("CAPTCHA_INDICATOR_PATTERNS constant", () => {
  it("is a non-empty readonly array of RegExp", () => {
    expect(CAPTCHA_INDICATOR_PATTERNS.length).toBeGreaterThan(0);
    for (const p of CAPTCHA_INDICATOR_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });
});
