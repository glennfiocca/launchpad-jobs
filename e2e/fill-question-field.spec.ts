import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fillQuestionField } from "../src/lib/ats/providers/ashby/playwright-apply";

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, "fixtures/self-hosters/ashby-question-types.html"),
  "utf8",
);

test.describe("fillQuestionField — type-aware Ashby form fill", () => {
  test("fills a text input via .fill()", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "firstName", "Glenn");
    expect(ok).toBe(true);
    expect(await page.inputValue("input[name=firstName]")).toBe("Glenn");
  });

  test("fills a textarea via .fill()", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "coverLetter", "Hello world");
    expect(ok).toBe(true);
    expect(await page.inputValue("textarea[name=coverLetter]")).toBe("Hello world");
  });

  test("checks the right radio for value=true (regression: prod bug from Cursor)", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "usAuth", "true");
    expect(ok).toBe(true);
    expect(await page.isChecked('input[name=usAuth][value="true"]')).toBe(true);
    expect(await page.isChecked('input[name=usAuth][value="false"]')).toBe(false);
  });

  test("checks the right radio for value=false (the exact failing case)", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "usAuth", "false");
    expect(ok).toBe(true);
    expect(await page.isChecked('input[name=usAuth][value="false"]')).toBe(true);
    expect(await page.isChecked('input[name=usAuth][value="true"]')).toBe(false);
  });

  test("returns false when no radio matches the requested value", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "usAuth", "maybe");
    expect(ok).toBe(false);
  });

  test("checks a checkbox for truthy strings", async ({ page }) => {
    for (const truthy of ["true", "1", "yes", "on", "TRUE", "Yes"]) {
      await page.setContent(FIXTURE_HTML);
      await fillQuestionField(page, "newsletter", truthy);
      expect(await page.isChecked("input[name=newsletter]")).toBe(true);
    }
  });

  test("unchecks a checkbox for falsy strings", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    // Pre-check it via JS to verify uncheck path
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>('input[name="newsletter"]');
      if (el) el.checked = true;
    });
    expect(await page.isChecked("input[name=newsletter]")).toBe(true);
    await fillQuestionField(page, "newsletter", "false");
    expect(await page.isChecked("input[name=newsletter]")).toBe(false);
  });

  test("selects an option via selectOption()", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "referralSource", "linkedin");
    expect(ok).toBe(true);
    expect(await page.inputValue("select[name=referralSource]")).toBe("linkedin");
  });

  test("skips file inputs (handled by setInputFiles elsewhere)", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "portfolio", "/tmp/resume.pdf");
    expect(ok).toBe(false);
  });

  test("returns false for unknown field name without throwing", async ({ page }) => {
    await page.setContent(FIXTURE_HTML);
    const ok = await fillQuestionField(page, "nonexistent", "value");
    expect(ok).toBe(false);
  });
});
