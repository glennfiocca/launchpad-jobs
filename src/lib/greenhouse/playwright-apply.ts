import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Page } from "playwright";
import type { UserProfile } from "@prisma/client";

export interface ApplyOptions {
  boardToken: string;
  jobId: string;
  profile: UserProfile;
  trackingEmail: string;
  resumeBuffer?: Buffer;
  resumeFileName?: string;
  coverLetter?: string;
  questionAnswers?: Record<string, string | number>;
  preferredFirstName?: string;
}

export interface ApplyResult {
  success: boolean;
  applicationId?: string;
  /** Machine-readable code for caller logic (e.g. "CAPTCHA_REQUIRED", "BROWSER_LAUNCH_FAILED") */
  errorCode?: string;
  error?: string;
  /** Direct Greenhouse apply URL for manual fallback */
  manualApplyUrl?: string;
}

// ─── CAPTCHA detection ────────────────────────────────────────────────────────

/**
 * Regex patterns applied against raw page HTML to detect bot-challenge pages.
 * Exported for unit tests — no Playwright dependency required.
 */
export const CAPTCHA_INDICATOR_PATTERNS: readonly RegExp[] = [
  /recaptcha/i,
  /hcaptcha/i,
  /data-sitekey/i,        // generic CAPTCHA widget attribute
  /cf-turnstile/i,        // Cloudflare Turnstile
  /cf_challenge/i,        // Cloudflare classic challenge
  /are you a robot/i,
  /verify you are human/i,
  /prove you'?re not a robot/i,
  /human verification/i,
  /bot detection/i,
];

/**
 * Pure function — tests raw HTML for CAPTCHA / challenge indicators.
 * Extracted for unit testability without a real browser.
 */
export function detectCaptchaInHtml(html: string): boolean {
  return CAPTCHA_INDICATOR_PATTERNS.some((p) => p.test(html));
}

/** Returns true if the live Playwright Page appears to show a bot challenge. */
async function hasCaptchaChallenge(page: Page): Promise<boolean> {
  // Structural check: challenge iframes are the most reliable signal
  const challengeFrame = await page.$(
    [
      'iframe[src*="recaptcha.google.com"]',
      'iframe[src*="hcaptcha.com"]',
      'iframe[title*="reCAPTCHA"]',
      'iframe[title*="hCaptcha"]',
      'div.cf-turnstile',
      'div[data-hcaptcha-widget-id]',
    ].join(", ")
  );
  if (challengeFrame) return true;

  // Fallback: scan raw HTML for textual indicators
  const html = await page.content();
  return detectCaptchaInHtml(html);
}

// ─── Greenhouse success detection ────────────────────────────────────────────

const SUCCESS_URL_PATTERN = /confirmation|thank|success|complete|submitted/i;

const SUCCESS_TEXT_PATTERN =
  /submitted|thank you|application received|we have received your application|successfully submitted/i;

/** Checks common Greenhouse confirmation page signals on the current page. */
async function isConfirmationPage(page: Page): Promise<boolean> {
  if (SUCCESS_URL_PATTERN.test(page.url())) return true;
  const body = (await page.textContent("body").catch(() => "")) ?? "";
  return SUCCESS_TEXT_PATTERN.test(body);
}

// ─── Navigation cascade ─────────────────────────────────────────────────────

export interface NavigationResult {
  found: boolean;
  finalUrl?: string;
  pathUsed: "direct" | "cta" | "embed";
  reason?: "captcha" | "not_found";
}

export const FORM_ANCHOR_SELECTOR = 'input[name="first_name"], input[id="first_name"]';

export async function navigateToApplicationForm(
  page: Page,
  boardToken: string,
  jobId: string
): Promise<NavigationResult> {
  // ── Attempt A — Direct (detail page) ──────────────────────────────────────
  const detailUrl = `https://job-boards.greenhouse.io/${boardToken}/jobs/${jobId}`;
  console.log(`[playwright-apply] Attempt direct: ${detailUrl}`);
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_500);
  console.log(`[playwright-apply] Landed on: ${page.url()}`);

  if (await hasCaptchaChallenge(page)) {
    return { found: false, finalUrl: page.url(), pathUsed: "direct", reason: "captcha" };
  }

  try {
    await page.waitForSelector(FORM_ANCHOR_SELECTOR, { timeout: 8_000 });
    return { found: true, finalUrl: page.url(), pathUsed: "direct" };
  } catch {
    // Form not found on detail page — fall through to CTA attempt
  }

  // ── Attempt B — CTA click on detail page ──────────────────────────────────
  console.log(`[playwright-apply] Attempt CTA on: ${page.url()}`);

  const ctaSelectors = [
    'a[href*="/embed/job_app"]',
    'a[href*="gh_jid="]',
    'a:has-text("Apply for this job")',
    'a:has-text("Apply")',
    'button:has-text("Apply for this job")',
    'button:has-text("Apply")',
    'a:has-text("Submit application")',
    'button:has-text("Submit application")',
  ];

  for (const selector of ctaSelectors) {
    const loc = page.locator(selector).first();
    try {
      if ((await loc.count()) > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {}),
          loc.click(),
        ]);
        console.log(`[playwright-apply] Clicked CTA: ${selector}`);
        await page.waitForTimeout(1_500);

        if (await hasCaptchaChallenge(page)) {
          return { found: false, finalUrl: page.url(), pathUsed: "cta", reason: "captcha" };
        }

        try {
          await page.waitForSelector(FORM_ANCHOR_SELECTOR, { timeout: 10_000 });
          return { found: true, finalUrl: page.url(), pathUsed: "cta" };
        } catch {
          // Form not found after CTA click — stop trying more CTAs
          break;
        }
      }
    } catch {
      // Click itself threw — try next selector
      continue;
    }
  }

  // ── Attempt C — Direct embed URL ──────────────────────────────────────────
  const embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${jobId}`;
  console.log(`[playwright-apply] Attempt embed: ${embedUrl}`);
  await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1_500);
  console.log(`[playwright-apply] Landed on: ${page.url()}`);

  if (await hasCaptchaChallenge(page)) {
    return { found: false, finalUrl: page.url(), pathUsed: "embed", reason: "captcha" };
  }

  try {
    await page.waitForSelector(FORM_ANCHOR_SELECTOR, { timeout: 10_000 });
    return { found: true, finalUrl: page.url(), pathUsed: "embed" };
  } catch {
    // All attempts exhausted
  }

  console.log(`[playwright-apply] Form not found after all attempts. Last URL: ${page.url()}`);
  return { found: false, finalUrl: page.url(), pathUsed: "embed", reason: "not_found" };
}

// ─── Main apply function ──────────────────────────────────────────────────────

/** Chromium flags tuned for containerised / headless Linux environments. */
export const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",   // belt-and-suspenders for root-less containers
  "--disable-dev-shm-usage",    // avoid /dev/shm exhaustion in containers
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",                // avoids a crash in some container setups
  "--disable-extensions",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

/**
 * Fill a react-select combobox by clicking the control and matching an option by text.
 * Returns true if an option was successfully clicked.
 */
async function fillPlaywrightReactSelect(
  page: Page,
  fieldId: string,
  targetLabel: string
): Promise<boolean> {
  const input = page.locator(`#${CSS.escape(fieldId)}[role="combobox"]`);
  if (!(await input.count())) return false;

  // Click the react-select control (parent of the input)
  const control = page.locator(`#${CSS.escape(fieldId)}`).locator("xpath=ancestor::div[contains(@class,'select__control')]");
  if (await control.count()) {
    await control.click();
  } else {
    await input.click();
  }

  await page.waitForSelector(".select__menu", { timeout: 3000 }).catch(() => {});

  const option = page.locator(".select__option").filter({ hasText: new RegExp(`^${targetLabel}$`, "i") }).first();
  if (await option.count()) {
    await option.click();
    return true;
  }
  await page.keyboard.press("Escape");
  return false;
}

export async function applyToGreenhouseJob(
  options: ApplyOptions
): Promise<ApplyResult> {
  const {
    boardToken,
    jobId,
    profile,
    trackingEmail,
    resumeBuffer,
    resumeFileName,
    coverLetter,
    questionAnswers,
    preferredFirstName,
  } = options;

  const manualApplyUrl = `https://job-boards.greenhouse.io/${boardToken}/jobs/${jobId}`;
  let tempResumeFile: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      args: CHROMIUM_ARGS,
      headless: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[playwright-apply] Browser launch failed:", msg);
    return {
      success: false,
      errorCode: "BROWSER_LAUNCH_FAILED",
      error: `Chromium could not start: ${msg}. Ensure system dependencies are installed (run: npx playwright install --with-deps chromium).`,
      manualApplyUrl,
    };
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Overall 60-second deadline per interaction
    context.setDefaultTimeout(60_000);

    const navResult = await navigateToApplicationForm(page, boardToken, jobId);

    if (navResult.reason === "captcha") {
      console.warn("[playwright-apply] Bot challenge detected — failing closed");
      return {
        success: false,
        errorCode: "CAPTCHA_REQUIRED",
        error:
          "Automation was blocked by a bot challenge on this job application. " +
          "Please apply manually using the link below.",
        manualApplyUrl,
      };
    }

    if (!navResult.found) {
      console.warn(`[playwright-apply] Form not found (pathUsed=${navResult.pathUsed})`);
      return {
        success: false,
        errorCode: "FORM_NOT_FOUND",
        error:
          "Could not locate the application form after multiple attempts. " +
          "Please apply manually using the link below.",
        manualApplyUrl,
      };
    }

    console.log(`[playwright-apply] Form detected via ${navResult.pathUsed} — filling fields`);

    // ── Fill basic fields ──────────────────────────────────────────────────────
    await page.fill(
      'input[name="first_name"], input[id="first_name"]',
      profile.firstName
    );
    await page.fill(
      'input[name="last_name"], input[id="last_name"]',
      profile.lastName
    );
    await page.fill(
      'input[name="email"], input[id="email"]',
      trackingEmail
    );

    if (profile.phone) {
      const phoneEl = await page.$('input[name="phone"], input[id="phone"]');
      if (phoneEl) await phoneEl.fill(profile.phone);
    }

    if (profile.location) {
      const locationEl = await page.$(
        'input[name="location"], input[id="location"]'
      );
      if (locationEl) await locationEl.fill(profile.location);
    }

    // ── Preferred first name ───────────────────────────────────────────────────
    if (preferredFirstName) {
      const prefEl = await page.$('#preferred_name, input[aria-label*="Preferred" i]');
      if (prefEl) await prefEl.fill(preferredFirstName);
    }

    // ── Resume upload ──────────────────────────────────────────────────────────
    if (resumeBuffer) {
      const ext = resumeFileName?.endsWith(".pdf") ? ".pdf" : ".pdf";
      tempResumeFile = path.join(
        os.tmpdir(),
        `resume-${Date.now()}${ext}`
      );
      fs.writeFileSync(tempResumeFile, resumeBuffer);
      const resumeInput = await page.$(
        'input[type="file"][name="resume"], input[id="resume"], input[type="file"][accept*="pdf"]'
      );
      if (resumeInput) {
        await resumeInput.setInputFiles(tempResumeFile);
        console.log("[playwright-apply] Resume uploaded");
      } else {
        console.log("[playwright-apply] Resume input not found — skipping");
      }
    }

    // ── Cover letter ───────────────────────────────────────────────────────────
    if (coverLetter) {
      const clEl = await page.$(
        'textarea[name="cover_letter"], textarea[name="cover_letter_text"], #cover_letter'
      );
      if (clEl) {
        await clEl.fill(coverLetter);
        console.log("[playwright-apply] Cover letter filled");
      }
    }

    // ── Custom question answers ────────────────────────────────────────────────
    if (questionAnswers) {
      for (const [fieldName, value] of Object.entries(questionAnswers)) {
        const strValue = String(value);

        const input = await page.$(
          `input[name="${fieldName}"], input[id="${fieldName}"]`
        );
        if (input) {
          await input.fill(strValue);
          continue;
        }

        const textarea = await page.$(
          `textarea[name="${fieldName}"], textarea[id="${fieldName}"]`
        );
        if (textarea) {
          await textarea.fill(strValue);
          continue;
        }

        const select = await page.$(
          `select[name="${fieldName}"], select[id="${fieldName}"]`
        );
        if (select) {
          await page
            .selectOption(
              `select[name="${fieldName}"], select[id="${fieldName}"]`,
              strValue
            )
            .catch(() => {
              console.log(
                `[playwright-apply] Could not select "${strValue}" for ${fieldName}`
              );
            });
          continue;
        }

        // Fallback: react-select combobox (Greenhouse uses react-select for all dropdowns)
        const reactSelectInput = await page.$(`#${fieldName}[role="combobox"]`);
        if (reactSelectInput) {
          await fillPlaywrightReactSelect(page, fieldName, strValue).catch(() => {
            console.log(`[playwright-apply] react-select fill failed for ${fieldName}`);
          });
        }
      }
    }

    // ── Submit ─────────────────────────────────────────────────────────────────
    console.log("[playwright-apply] Clicking submit");
    await page.click('button[type="submit"], input[type="submit"]');

    // ── Confirm success ────────────────────────────────────────────────────────
    try {
      // Wait for URL to indicate a confirmation page
      await page.waitForURL(SUCCESS_URL_PATTERN, { timeout: 15_000 });
    } catch {
      // URL may not change on single-page confirmation; fall through to text check
    }

    if (await isConfirmationPage(page)) {
      const finalUrl = page.url();
      const idMatch = finalUrl.match(/\/(\d{6,})/) ?? [];
      const applicationId = idMatch[1] ?? "";
      console.log(`[playwright-apply] Success — confirmation: ${finalUrl}`);
      return { success: true, applicationId, manualApplyUrl };
    }

    // Collect any visible error messages as last resort
    const errorText =
      (
        await page
          .textContent('.error, [class*="error"], [role="alert"]')
          .catch(() => "")
      )?.trim() ?? "";

    const errMsg =
      errorText || "Form submitted but no confirmation detected";
    console.warn(`[playwright-apply] No confirmation — treating as failure: ${errMsg}`);
    return {
      success: false,
      errorCode: "NO_CONFIRMATION",
      error: errMsg,
      manualApplyUrl,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown Playwright error";
    console.error("[playwright-apply] Error:", err);
    return {
      success: false,
      errorCode: "PLAYWRIGHT_ERROR",
      error: msg,
      manualApplyUrl,
    };
  } finally {
    if (tempResumeFile && fs.existsSync(tempResumeFile)) {
      fs.unlinkSync(tempResumeFile);
    }
    if (browser) await browser.close();
  }
}
