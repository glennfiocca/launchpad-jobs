import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
}

export interface ApplyResult {
  success: boolean;
  applicationId?: string;
  error?: string;
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
    coverLetter,
    questionAnswers,
  } = options;

  let tempResumeFile: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      headless: true,
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Overall 60-second deadline
    context.setDefaultTimeout(60_000);

    const url = `https://job-boards.greenhouse.io/${boardToken}/jobs/${jobId}`;
    console.log(`[playwright-apply] Navigating to ${url}`);

    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    console.log(`[playwright-apply] Landed on: ${page.url()}`);

    // Wait for the application form to appear
    await page.waitForSelector(
      'input[name="first_name"], input[id="first_name"]',
      { timeout: 15_000 }
    );
    console.log("[playwright-apply] Form detected — filling fields");

    // Basic fields
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
      const phoneEl = await page.$(
        'input[name="phone"], input[id="phone"]'
      );
      if (phoneEl) await phoneEl.fill(profile.phone);
    }

    if (profile.location) {
      const locationEl = await page.$(
        'input[name="location"], input[id="location"]'
      );
      if (locationEl) await locationEl.fill(profile.location);
    }

    // Resume upload — write Buffer to a temp file first
    if (resumeBuffer) {
      tempResumeFile = path.join(os.tmpdir(), `resume-${Date.now()}.pdf`);
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

    // Cover letter
    if (coverLetter) {
      const clEl = await page.$(
        'textarea[name="cover_letter"], textarea[name="cover_letter_text"], #cover_letter'
      );
      if (clEl) {
        await clEl.fill(coverLetter);
        console.log("[playwright-apply] Cover letter filled");
      }
    }

    // Custom question answers (question_XXXXXXXX keys)
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
                `[playwright-apply] Could not select option "${strValue}" for ${fieldName}`
              );
            });
        }
      }
    }

    // Submit the form
    console.log("[playwright-apply] Clicking submit");
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for confirmation
    try {
      await page.waitForURL(/confirmation|thank|success/i, { timeout: 15_000 });
      const finalUrl = page.url();
      // Greenhouse sometimes puts the application ID in the confirmation URL
      const idMatch = finalUrl.match(/\/(\d{6,})/) ?? [];
      const applicationId = idMatch[1] ?? "";
      console.log(`[playwright-apply] Success! Confirmation URL: ${finalUrl}`);
      return { success: true, applicationId };
    } catch {
      // URL did not change to a confirmation path — check page text as fallback
      const bodyText = (await page.textContent("body")) ?? "";
      if (/submitted|thank you|application received/i.test(bodyText)) {
        console.log(
          "[playwright-apply] Success detected via page text (no URL change)"
        );
        return { success: true, applicationId: "" };
      }

      // Collect any visible error messages
      const errorText = await page
        .textContent('.error, [class*="error"], [role="alert"]')
        .catch(() => "");

      const errMsg =
        (errorText ?? "").trim() ||
        "Form submitted but no confirmation detected";
      console.log(`[playwright-apply] No confirmation — treating as failure: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown Playwright error";
    console.error("[playwright-apply] Error:", err);
    return { success: false, error: msg };
  } finally {
    if (tempResumeFile && fs.existsSync(tempResumeFile)) {
      fs.unlinkSync(tempResumeFile);
    }
    if (browser) await browser.close();
  }
}
