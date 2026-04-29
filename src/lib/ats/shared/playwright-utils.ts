import { chromium, type Page, type Browser, type BrowserContext } from "playwright";

// ─── Chromium launch config ──────────────────────────────────────────────────

/** Chromium flags tuned for containerised / headless Linux environments. */
export const CHROMIUM_ARGS: readonly string[] = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--disable-extensions",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  // Stealth: prevent navigator.webdriver detection
  "--disable-blink-features=AutomationControlled",
];

// ─── CAPTCHA detection ───────────────────────────────────────────────────────

/**
 * Regex patterns applied against raw page HTML to detect bot-challenge pages.
 * Exported for unit tests — no Playwright dependency required.
 */
export const CAPTCHA_INDICATOR_PATTERNS: readonly RegExp[] = [
  /recaptcha/i,
  /hcaptcha/i,
  /data-sitekey/i,
  /cf-turnstile/i,
  /cf_challenge/i,
  /are you a robot/i,
  /verify you are human/i,
  /prove you'?re not a robot/i,
  /human verification/i,
  /bot detection/i,
];

/** Structural selectors for CAPTCHA iframes / widgets. */
const CAPTCHA_FRAME_SELECTORS: readonly string[] = [
  'iframe[src*="recaptcha.google.com"]',
  'iframe[src*="hcaptcha.com"]',
  'iframe[title*="reCAPTCHA"]',
  'iframe[title*="hCaptcha"]',
  "div.cf-turnstile",
  "div[data-hcaptcha-widget-id]",
];

/**
 * Pure function — tests raw HTML for CAPTCHA / challenge indicators.
 * Extracted for unit testability without a real browser.
 */
export function detectCaptchaInHtml(html: string): boolean {
  return CAPTCHA_INDICATOR_PATTERNS.some((p) => p.test(html));
}

/** Returns true if the live Playwright Page appears to show a bot challenge. */
export async function hasCaptchaChallenge(page: Page): Promise<boolean> {
  // Structural check: challenge iframes are the most reliable signal
  const challengeFrame = await page.$(CAPTCHA_FRAME_SELECTORS.join(", "));
  if (challengeFrame) return true;

  // Fallback: scan raw HTML for textual indicators
  const html = await page.content();
  return detectCaptchaInHtml(html);
}

// ─── Confirmation page detection ─────────────────────────────────────────────

export const SUCCESS_URL_PATTERN =
  /confirmation|thank|success|complete|submitted/i;

export const SUCCESS_TEXT_PATTERN =
  /submitted|thank you|application received|we have received your application|successfully submitted/i;

/**
 * Checks common post-submit confirmation signals on the current page.
 * Returns whether the page looks like a confirmation, plus an optional
 * application ID extracted from the URL.
 */
export async function isConfirmationPage(
  page: Page
): Promise<{ confirmed: boolean; applicationId?: string }> {
  const url = page.url();

  if (SUCCESS_URL_PATTERN.test(url)) {
    const idMatch = url.match(/\/(\d{6,})/);
    return { confirmed: true, applicationId: idMatch?.[1] };
  }

  const body = (await page.textContent("body").catch(() => "")) ?? "";
  if (SUCCESS_TEXT_PATTERN.test(body)) {
    return { confirmed: true };
  }

  return { confirmed: false };
}

// ─── Browser launch helper ───────────────────────────────────────────────────

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [...CHROMIUM_ARGS],
  });
}

// ─── Stealth browser context ────────────────────────────────────────────────

/** JS injected before every page load to mask automation signals. */
const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
`;

/**
 * Creates a browser context with realistic fingerprints and stealth JS.
 * Use this instead of raw `browser.newContext()` for ATS apply flows.
 */
export async function createStealthContext(
  browser: Browser,
  userAgent?: string
): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  return context;
}

// ─── Generic form helpers ────────────────────────────────────────────────────

/**
 * Wait for any of the given CSS selectors to appear on the page.
 * Returns true if at least one matched before the timeout.
 */
export async function waitForFormLoad(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number = 10_000
): Promise<boolean> {
  const combined = selectors.join(", ");
  try {
    await page.waitForSelector(combined, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
