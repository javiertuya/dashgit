import { test, expect } from "@playwright/test";
import { blockGitApis, saveScreenshot } from "./mock-helpers.js";

/**
 * End-to-end smoke tests for the DashGit web app.
 *
 * These tests boot the real application in a browser with empty local storage.
 * In this state the app renders fully but makes NO GitHub/GitLab API calls
 * (there are no configured providers), so no credentials are required.
 *
 * As a safety net, any request to the git platform APIs is aborted so the smoke
 * test can never depend on live GitHub/GitLab services. CDN assets are left untouched.
 */

const TAB_IDS = [
  "#assigned-tab",
  "#involved-tab",
  "#created-tab",
  "#unassigned-tab",
  "#follow-up-tab",
  "#dependabot-tab",
  "#statuses-tab",
  "#config-tab",
];

test.beforeEach(async ({ page }) => {
  // Block only the git platform APIs, keep CDN assets working
  await blockGitApis(page);
});

// Screenshot each test (pass or fail) for manual verification, saved under e2e/screenshots/.
test.afterEach(async ({ page }, testInfo) => {
  await saveScreenshot(page, testInfo);
});

test("app boots with empty configuration and no credentials", async ({ page }) => {
  await page.goto("/");

  // Page and header identity
  await expect(page).toHaveTitle(/DashGit/);
  await expect(page.locator("h3")).toContainText("DashGit");
  await expect(page.locator("#appVersion")).toHaveText("main");

  // The tab bar and all tabs are visible
  await expect(page.locator("#tab-headers")).toBeVisible();
  for (const id of TAB_IDS)
    await expect(page.locator(id)).toBeVisible();

  // The default Assigned tab shows the "no providers" warning (rendered into the alert area)
  await expect(page.locator("#alert-div")).toContainText("No providers have been configured");

  // The Configure tab renders the providers form
  await page.locator("#config-tab").click();
  await expect(page.locator(".config-btn-add-github")).toBeVisible();
  await expect(page.locator("#stauts-no-providers")).toBeVisible();
});

test("add a GitHub provider through the UI and verify it persists", async ({ page }) => {
  await page.goto("/");

  // Go to the Configure tab
  await page.locator("#config-tab").click();
  await expect(page.locator(".config-btn-add-github")).toBeVisible();

  // Add a GitHub provider (first provider gets key 0) and set the username
  await page.locator(".config-btn-add-github").click();
  await expect(page.locator("#config-providers-user-0")).toBeVisible();
  // Type with real key events: the form's custom validation runs on 'keyup',
  // so fill() alone would leave the required field flagged invalid and block the save.
  await page.locator("#config-providers-user-0").pressSequentially("smoke-user");

  // Save from within the provider card (last submit button on the form)
  await page.locator(".config-btn-provider-submit").last().click();

  // The configuration is persisted to local storage
  await expect
    .poll(async () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("dashgit-config")))
    )
    .toMatchObject({ providers: [{ provider: "GitHub", user: "smoke-user" }] });

  // The "no providers" message is no longer shown once a provider exists
  await expect(page.locator("#stauts-no-providers")).toBeHidden();
});
