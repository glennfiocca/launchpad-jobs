import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import type { Page } from "playwright";
import type {
  AtsApplyStrategy,
  AtsApplyOptions,
  AtsApplyResult,
} from "../../types";
import {
  launchBrowser,
  createStealthContext,
  hasCaptchaChallenge,
  isConfirmationPage,
  waitForFormLoad,
} from "../../shared/playwright-utils";
import { clickApplyTrigger } from "./click-apply-trigger";

// ─── Ashby form selectors ───────────────────────────────────────────────────

/** Selectors that signal the Ashby application form has loaded. */
const FORM_LOAD_SELECTORS: readonly string[] = [
  'input[name="_systemfield_name"]',
  'input[name="_systemfield_email"]',
  "form",
];

/** Timeout for waiting on Ashby's React SPA to render. */
const FORM_LOAD_TIMEOUT_MS = 15_000;

/** Timeout for post-submit confirmation detection. */
const CONFIRMATION_TIMEOUT_MS = 15_000;

// ─── Ashby apply strategy ───────────────────────────────────────────────────

export class AshbyApplyStrategy implements AtsApplyStrategy {
  readonly provider = "ASHBY" as const;

  async apply(options: AtsApplyOptions): Promise<AtsApplyResult> {
    const {
      applyUrl,
      applySelector,
      jobExternalId,
      profile,
      trackingEmail,
      resumeBuffer,
      resumeFileName,
      coverLetter,
      questionAnswers,
    } = options;

    const manualApplyUrl = applyUrl;
    let tempResumeFile: string | null = null;

    // ── Launch browser ────────────────────────────────────────────────────
    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

    try {
      browser = await launchBrowser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ashby-apply] Browser launch failed:", msg);
      return {
        success: false,
        errorCode: "BROWSER_LAUNCH_FAILED",
        error: `Chromium could not start: ${msg}. Ensure system dependencies are installed (run: npx playwright install --with-deps chromium).`,
        manualApplyUrl,
      };
    }

    try {
      const context = await createStealthContext(browser);
      const page = await context.newPage();
      context.setDefaultTimeout(60_000);

      // ── Navigate to application page ──────────────────────────────────
      // Some Ashby boards embed the form on the job page; others use a
      // separate /application tab. Try the given URL first, then fall
      // back to /application if the form isn't found on the initial page.
      console.log(`[ashby-apply] Navigating to: ${applyUrl}`);
      await page.goto(applyUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      // Ashby is a React SPA — give it time to hydrate
      await page.waitForTimeout(2_000);
      console.log(`[ashby-apply] Landed on: ${page.url()}`);

      // ── CAPTCHA check ─────────────────────────────────────────────────
      if (await hasCaptchaChallenge(page)) {
        console.warn("[ashby-apply] Bot challenge detected — failing closed");
        return {
          success: false,
          errorCode: "CAPTCHA_REQUIRED",
          error:
            "Automation was blocked by a bot challenge on this job application. " +
            "Please apply manually using the link below.",
          manualApplyUrl,
        };
      }

      // ── Click in-page "Apply" trigger if present ──────────────────────
      // Self-hoster careers pages render the listing first; the form is
      // gated behind an Apply button. On hosted Ashby boards there is no
      // such trigger and `clickApplyTrigger` cleanly returns clicked=false
      // — `waitForFormLoad` then sees the form that's already in DOM.
      const triggerOutcome = await clickApplyTrigger(
        page,
        applySelector ?? null
      );
      console.log(
        `[ashby-apply] apply-trigger-click ${JSON.stringify({
          event: "apply-trigger-click",
          clicked: triggerOutcome.clicked,
          selector: triggerOutcome.selector,
          jobId: jobExternalId,
        })}`
      );

      // ── Wait for form to render ───────────────────────────────────────
      let formLoaded = await waitForFormLoad(
        page,
        FORM_LOAD_SELECTORS,
        FORM_LOAD_TIMEOUT_MS
      );

      // If no form found and URL doesn't already point to /application,
      // try the dedicated application tab (some Ashby boards split it out)
      if (!formLoaded && !applyUrl.endsWith("/application")) {
        const appTabUrl = `${applyUrl.replace(/\/$/, "")}/application`;
        console.log(`[ashby-apply] Form not found — trying: ${appTabUrl}`);
        await page.goto(appTabUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.waitForTimeout(2_000);

        if (await hasCaptchaChallenge(page)) {
          console.warn("[ashby-apply] Bot challenge on /application tab");
          return {
            success: false,
            errorCode: "CAPTCHA_REQUIRED",
            error:
              "Automation was blocked by a bot challenge on this job application. " +
              "Please apply manually using the link below.",
            manualApplyUrl,
          };
        }

        formLoaded = await waitForFormLoad(
          page,
          FORM_LOAD_SELECTORS,
          FORM_LOAD_TIMEOUT_MS
        );
      }

      if (!formLoaded) {
        console.warn("[ashby-apply] Form not found on either page");
        return {
          success: false,
          errorCode: "FORM_NOT_FOUND",
          error:
            "Could not locate the application form. " +
            "Please apply manually using the link below.",
          manualApplyUrl,
        };
      }

      console.log("[ashby-apply] Form detected — filling fields");

      // ── Fill name field ───────────────────────────────────────────────
      const fullName = `${profile.firstName} ${profile.lastName}`;
      const nameEl = await page.$(
        'input[name="_systemfield_name"], input[name="name"], input[id="name"]'
      );
      if (nameEl) {
        await nameEl.fill(fullName);
      } else {
        // Fallback: separate first/last name fields
        const firstEl = await page.$(
          'input[name="first_name"], input[name="firstName"]'
        );
        const lastEl = await page.$(
          'input[name="last_name"], input[name="lastName"]'
        );
        if (firstEl) await firstEl.fill(profile.firstName);
        if (lastEl) await lastEl.fill(profile.lastName);
      }

      // ── Fill email ────────────────────────────────────────────────────
      const emailEl = await page.$(
        'input[name="_systemfield_email"], input[name="email"], input[type="email"]'
      );
      if (emailEl) await emailEl.fill(trackingEmail);

      // ── Fill phone ────────────────────────────────────────────────────
      if (profile.phone) {
        const phoneEl = await page.$(
          'input[name="_systemfield_phone"], input[name="phone"], input[type="tel"]'
        );
        if (phoneEl) await phoneEl.fill(profile.phone);
      }

      // ── Fill LinkedIn URL ─────────────────────────────────────────────
      if (profile.linkedInUrl) {
        const linkedInEl = await page.$(
          'input[name="_systemfield_linkedin"], input[name="linkedin"], input[placeholder*="linkedin" i]'
        );
        if (linkedInEl) await linkedInEl.fill(profile.linkedInUrl);
      }

      // ── Fill GitHub URL ───────────────────────────────────────────────
      if (profile.githubUrl) {
        const githubEl = await page.$(
          'input[name="_systemfield_github"], input[name="github"], input[placeholder*="github" i]'
        );
        if (githubEl) await githubEl.fill(profile.githubUrl);
      }

      // ── Fill website URL ──────────────────────────────────────────────
      if (profile.websiteUrl) {
        const websiteEl = await page.$(
          'input[name="_systemfield_website"], input[name="website"], input[placeholder*="website" i], input[placeholder*="portfolio" i]'
        );
        if (websiteEl) await websiteEl.fill(profile.websiteUrl);
      }

      // ── Resume upload ─────────────────────────────────────────────────
      if (resumeBuffer) {
        const ext = resumeFileName?.endsWith(".pdf") ? ".pdf" : ".pdf";
        tempResumeFile = path.join(os.tmpdir(), `resume-${Date.now()}${ext}`);
        fs.writeFileSync(tempResumeFile, resumeBuffer);

        // Target ONLY the canonical resume field — never the parser/autofill uploader.
        // Ashby's showAutofillApplicationsBox renders a separate uploader that
        // auto-parses and overwrites form fields. Generic input[type="file"] MUST NOT
        // be used as a fallback since it could match the parser uploader.
        const resumeInput = await page.$(
          'input[type="file"][name="_systemfield_resume"], input[type="file"][name="resume"]'
        );
        if (resumeInput) {
          await resumeInput.setInputFiles(tempResumeFile);
          console.log("[ashby-apply] Resume uploaded to canonical field");
        } else {
          console.log("[ashby-apply] Canonical resume input (_systemfield_resume) not found — skipping upload to avoid parser uploader");
        }
      }

      // ── Cover letter ──────────────────────────────────────────────────
      if (coverLetter) {
        const coverLetterEl = await page.$(
          'textarea[name="cover_letter"], textarea[name="coverLetter"], textarea[placeholder*="cover letter" i]'
        );
        if (coverLetterEl) {
          await coverLetterEl.fill(coverLetter);
          console.log("[ashby-apply] Cover letter filled");
        }
      }

      // ── Custom question answers ───────────────────────────────────────
      if (questionAnswers) {
        for (const [fieldName, value] of Object.entries(questionAnswers)) {
          const strValue = String(value);
          await fillQuestionField(page, fieldName, strValue);
        }
      }

      // ── Submit form ───────────────────────────────────────────────────
      console.log("[ashby-apply] Clicking submit");

      const submitButton = page
        .locator(
          [
            'button[type="submit"]',
            'button:has-text("Submit Application")',
            'button:has-text("Submit")',
            'button:has-text("Apply")',
            'input[type="submit"]',
          ].join(", ")
        )
        .first();

      await submitButton.click();

      // ── Confirm success ───────────────────────────────────────────────
      // Wait for navigation or SPA route change
      await page
        .waitForTimeout(3_000)
        .then(() =>
          page.waitForLoadState("networkidle", {
            timeout: CONFIRMATION_TIMEOUT_MS,
          })
        )
        .catch(() => {
          // networkidle may not fire in SPAs — continue to content check
        });

      const confirmation = await isConfirmationPage(page);

      if (confirmation.confirmed) {
        console.log(
          `[ashby-apply] Success — confirmation detected at: ${page.url()}`
        );
        return {
          success: true,
          applicationId: confirmation.applicationId,
          manualApplyUrl,
        };
      }

      // Collect any visible error messages
      const errorText =
        (
          await page
            .textContent(
              '.error, [class*="error"], [role="alert"], [class*="Error"]'
            )
            .catch(() => "")
        )?.trim() ?? "";

      const errMsg =
        errorText || "Form submitted but no confirmation detected";
      console.warn(
        `[ashby-apply] No confirmation — treating as failure: ${errMsg}`
      );
      return {
        success: false,
        errorCode: "NO_CONFIRMATION",
        error: errMsg,
        manualApplyUrl,
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown Playwright error";
      console.error("[ashby-apply] Error:", err);
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
}

const TRUTHY_STRINGS = new Set(["true", "1", "yes", "on"]);

/**
 * Type-aware fill for Ashby custom-question fields. The legacy implementation
 * unconditionally called `.fill()` on whatever `input[name=X]` matched first,
 * which Playwright rejects on radios + checkboxes. Real-world Ashby self-
 * hoster forms (Cursor, Deel) include yes/no questions implemented as radio
 * pairs and consent toggles implemented as checkboxes — both must dispatch
 * to `.check()` / `.setChecked()`, not `.fill()`.
 */
export async function fillQuestionField(
  page: Page,
  fieldName: string,
  strValue: string,
): Promise<boolean> {
  const escaped = fieldName.replace(/"/g, '\\"');
  const inputSelector = `input[name="${escaped}"], input[id="${escaped}"]`;
  const textareaSelector = `textarea[name="${escaped}"], textarea[id="${escaped}"]`;
  const selectSelector = `select[name="${escaped}"], select[id="${escaped}"]`;

  const input = await page.$(inputSelector);
  if (input) {
    const type = ((await input.getAttribute("type")) ?? "text").toLowerCase();
    if (type === "radio") {
      const radio = await page.$(
        `input[type="radio"][name="${escaped}"][value="${strValue.replace(/"/g, '\\"')}"], ` +
          `input[type="radio"][id="${escaped}"][value="${strValue.replace(/"/g, '\\"')}"]`,
      );
      if (radio) {
        // Ashby self-hosters (Cursor, Deel, etc.) wrap radio inputs in styled
        // <label> elements that visually replace the native radio and
        // intercept pointer events. Playwright's strict actionability check
        // refuses to click the input directly. force:true skips the intercept
        // check — the click still propagates to the wrapped radio.
        await radio.check({ force: true });
        return true;
      }
      console.log(
        `[ashby-apply] No radio with value="${strValue}" for ${fieldName}`,
      );
      return false;
    }
    if (type === "checkbox") {
      const isTrue = TRUTHY_STRINGS.has(strValue.toLowerCase());
      // Same wrapper-label pattern applies to checkboxes (consent toggles,
      // newsletter opt-ins). force:true for the same reason as radios.
      await input.setChecked(isTrue, { force: true });
      return true;
    }
    if (type === "file") {
      // Resume / file uploads are handled by the explicit setInputFiles
      // path earlier in the apply flow, not by question-answer fill.
      return false;
    }
    await input.fill(strValue);
    return true;
  }

  const textarea = await page.$(textareaSelector);
  if (textarea) {
    await textarea.fill(strValue);
    return true;
  }

  const select = await page.$(selectSelector);
  if (select) {
    try {
      await page.selectOption(selectSelector, strValue);
      return true;
    } catch {
      console.log(
        `[ashby-apply] Could not select "${strValue}" for ${fieldName}`,
      );
      return false;
    }
  }

  console.log(
    `[ashby-apply] No matching field found for question: ${fieldName}`,
  );
  return false;
}
