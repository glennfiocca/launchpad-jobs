import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";

import {
  navigateToApplicationForm,
  detectCaptchaInHtml,
  CAPTCHA_INDICATOR_PATTERNS,
  FORM_ANCHOR_SELECTOR,
  type NavigationResult,
} from "./playwright-apply";

// ─── Mock Page factory ──────────────────────────────────────────────────────

interface MockLocatorFirst {
  count: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
}

interface MockLocator {
  first: () => MockLocatorFirst;
}

interface MockPage {
  goto: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  url: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
  waitForNavigation: ReturnType<typeof vi.fn>;
  $: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
}

function createMockPage(): MockPage {
  let currentUrl = "about:blank";

  const mockLocatorFirst: MockLocatorFirst = {
    count: vi.fn().mockResolvedValue(0),
    click: vi.fn().mockResolvedValue(undefined),
  };

  const page: MockPage = {
    goto: vi.fn().mockImplementation(async (url: string) => {
      currentUrl = url;
    }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockImplementation(() => currentUrl),
    waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
    locator: vi.fn().mockReturnValue({
      first: () => mockLocatorFirst,
    } as MockLocator),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    content: vi.fn().mockResolvedValue("<html><body>Clean page</body></html>"),
  };

  return page;
}

const BOARD_TOKEN = "test-board";
const JOB_ID = "12345";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("navigateToApplicationForm", () => {
  let page: MockPage;

  beforeEach(() => {
    page = createMockPage();
  });

  it("returns direct success when form is found on detail page", async () => {
    // waitForSelector resolves on the first call (detail page has the form)
    page.waitForSelector.mockResolvedValueOnce(true);

    const result: NavigationResult = await navigateToApplicationForm(
      page as unknown as Page,
      BOARD_TOKEN,
      JOB_ID
    );

    expect(result).toEqual({
      found: true,
      finalUrl: `https://job-boards.greenhouse.io/${BOARD_TOKEN}/jobs/${JOB_ID}`,
      pathUsed: "direct",
    });

    // goto called exactly once with the detail URL
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith(
      `https://job-boards.greenhouse.io/${BOARD_TOKEN}/jobs/${JOB_ID}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
  });

  it("returns cta success when form is found after CTA click", async () => {
    // Detail page: waitForSelector rejects (form not on detail page)
    page.waitForSelector
      .mockRejectedValueOnce(new Error("Timeout"))   // detail attempt
      .mockResolvedValueOnce(true);                    // after CTA click

    // First CTA selector ('a[href*="/embed/job_app"]') has count > 0
    const ctaLocatorFirst: MockLocatorFirst = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
    };

    page.locator.mockReturnValue({
      first: () => ctaLocatorFirst,
    } as MockLocator);

    const result: NavigationResult = await navigateToApplicationForm(
      page as unknown as Page,
      BOARD_TOKEN,
      JOB_ID
    );

    expect(result).toEqual({
      found: true,
      finalUrl: `https://job-boards.greenhouse.io/${BOARD_TOKEN}/jobs/${JOB_ID}`,
      pathUsed: "cta",
    });

    // goto called only once (detail page, not embed)
    expect(page.goto).toHaveBeenCalledTimes(1);

    // CTA click was invoked
    expect(ctaLocatorFirst.click).toHaveBeenCalled();
  });

  it("returns embed fallback success when CTA fails but embed works", async () => {
    // Detail page: waitForSelector rejects
    // After embed goto: waitForSelector resolves
    page.waitForSelector
      .mockRejectedValueOnce(new Error("Timeout"))   // detail attempt
      .mockResolvedValueOnce(true);                    // embed attempt

    // All CTA locators return count 0 (default mock behavior)
    const emptyLocatorFirst: MockLocatorFirst = {
      count: vi.fn().mockResolvedValue(0),
      click: vi.fn().mockResolvedValue(undefined),
    };

    page.locator.mockReturnValue({
      first: () => emptyLocatorFirst,
    } as MockLocator);

    const result: NavigationResult = await navigateToApplicationForm(
      page as unknown as Page,
      BOARD_TOKEN,
      JOB_ID
    );

    expect(result).toEqual({
      found: true,
      finalUrl: `https://job-boards.greenhouse.io/embed/job_app?for=${BOARD_TOKEN}&token=${JOB_ID}`,
      pathUsed: "embed",
    });

    // goto called twice: detail + embed
    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenNthCalledWith(
      1,
      `https://job-boards.greenhouse.io/${BOARD_TOKEN}/jobs/${JOB_ID}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    expect(page.goto).toHaveBeenNthCalledWith(
      2,
      `https://job-boards.greenhouse.io/embed/job_app?for=${BOARD_TOKEN}&token=${JOB_ID}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
  });

  it("returns captcha when challenge is detected on initial page", async () => {
    // page.$ returns a truthy value for the captcha iframe selector
    page.$.mockResolvedValue({ tagName: "IFRAME" });

    const result: NavigationResult = await navigateToApplicationForm(
      page as unknown as Page,
      BOARD_TOKEN,
      JOB_ID
    );

    expect(result).toEqual({
      found: false,
      finalUrl: `https://job-boards.greenhouse.io/${BOARD_TOKEN}/jobs/${JOB_ID}`,
      pathUsed: "direct",
      reason: "captcha",
    });

    // No further navigation after captcha detection
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.waitForSelector).not.toHaveBeenCalled();
  });

  it("returns not_found when form is absent everywhere", async () => {
    // Both detail and embed waitForSelector reject
    page.waitForSelector
      .mockRejectedValueOnce(new Error("Timeout"))    // detail attempt
      .mockRejectedValueOnce(new Error("Timeout"));   // embed attempt

    // All CTA locators return count 0
    const emptyLocatorFirst: MockLocatorFirst = {
      count: vi.fn().mockResolvedValue(0),
      click: vi.fn().mockResolvedValue(undefined),
    };

    page.locator.mockReturnValue({
      first: () => emptyLocatorFirst,
    } as MockLocator);

    const result: NavigationResult = await navigateToApplicationForm(
      page as unknown as Page,
      BOARD_TOKEN,
      JOB_ID
    );

    expect(result).toEqual({
      found: false,
      finalUrl: `https://job-boards.greenhouse.io/embed/job_app?for=${BOARD_TOKEN}&token=${JOB_ID}`,
      pathUsed: "embed",
      reason: "not_found",
    });

    // goto called twice (detail + embed)
    expect(page.goto).toHaveBeenCalledTimes(2);
  });
});

// ─── detectCaptchaInHtml unit tests ─────────────────────────────────────────

describe("detectCaptchaInHtml", () => {
  const captchaSnippets: ReadonlyArray<{ label: string; html: string }> = [
    { label: "reCAPTCHA script tag", html: '<script src="https://www.google.com/recaptcha/api.js"></script>' },
    { label: "hCaptcha container", html: '<div class="hcaptcha" data-sitekey="abc123"></div>' },
    { label: "data-sitekey attribute", html: '<div data-sitekey="6Lc..."></div>' },
    { label: "Cloudflare Turnstile div", html: '<div class="cf-turnstile"></div>' },
    { label: "Cloudflare classic challenge", html: '<div id="cf_challenge"></div>' },
    { label: "human verification text", html: "<p>Please complete human verification to continue.</p>" },
    { label: "are you a robot prompt", html: "<h2>Are you a robot?</h2>" },
    { label: "verify you are human", html: "<span>Verify you are human</span>" },
    { label: "bot detection message", html: "<p>Bot detection triggered. Please try again.</p>" },
    { label: "prove you're not a robot", html: "<p>Please prove you're not a robot to continue.</p>" },
  ];

  for (const { label, html } of captchaSnippets) {
    it(`detects: ${label}`, () => {
      expect(detectCaptchaInHtml(html)).toBe(true);
    });
  }

  it("returns false for clean HTML without captcha indicators", () => {
    const cleanHtml = `
      <html>
        <head><title>Apply for Software Engineer</title></head>
        <body>
          <form>
            <input name="first_name" />
            <input name="last_name" />
            <button type="submit">Submit</button>
          </form>
        </body>
      </html>
    `;
    expect(detectCaptchaInHtml(cleanHtml)).toBe(false);
  });

  it("covers every pattern in CAPTCHA_INDICATOR_PATTERNS", () => {
    // Verify every pattern has at least one matching snippet above
    for (const pattern of CAPTCHA_INDICATOR_PATTERNS) {
      const matched = captchaSnippets.some(({ html }) => pattern.test(html));
      expect(matched, `No test snippet matches pattern: ${pattern}`).toBe(true);
    }
  });
});
