import { test, expect } from "@playwright/test";
import { blockGitApis, mockProductionEnvironment, saveScreenshot } from "./mock-helpers.js";

/**
 * End-to-end tests for the OAuth2 configuration of a provider, that depends on the environment
 * where the app is deployed (see app/login/OAConfig.js):
 * - Development (the url of the test server, that is not a known deployment): there is no OAuth app
 *   registered, so the user must enter the OAuth App ID. Customize OAuth2 is forced and the App ID
 *   is required to save the configuration.
 * - Production: there is a default OAuth app, so customizing is optional and the App ID can be empty.
 *
 * These tests only exercise the configuration form, no GitHub/GitLab API calls are made.
 */

// Ids of the inputs of the first provider (key 0)
const AUTH = "#config-providers-auth-select-0";
const CUSTOMIZE = "#config-providers-oauth-customize-0";
const CLIENT_ID = "#config-providers-oauth-clientId-0";
const TOKEN_URL = "#config-providers-oauth-tokenUrl-0";

test.beforeEach(async ({ page }) => {
  await blockGitApis(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await saveScreenshot(page, testInfo);
});

// Adds a provider of the given platform with a username, ready to configure the authentication.
// Types with real key events because the custom validation of the form runs on 'keyup'
async function addProvider(page, platform) {
  await page.locator("#config-tab").click();
  await page.locator(`.config-btn-add-${platform}`).click();
  await page.locator("#config-providers-user-0").pressSequentially("oauser");
}

// Number of providers that have been saved in the local storage
async function savedProviders(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("dashgit-config")).providers.length);
}

test("develop environment requires the OAuth App ID of a GitHub provider", async ({ page }) => {
  await page.goto("/");
  await addProvider(page, "github");

  // Enabling OAuth2 forces the customization, as the App ID must be entered by the user
  await page.locator(AUTH).check();
  await expect(page.locator(CUSTOMIZE)).toBeChecked();
  await expect(page.locator(CUSTOMIZE)).toBeDisabled();
  await expect(page.locator(CLIENT_ID)).toBeVisible();
  await expect(page.locator(TOKEN_URL)).toBeVisible();

  // The empty App ID is flagged as invalid and prevents saving the configuration
  await expect(page.locator(CLIENT_ID)).toHaveClass(/is-invalid/);
  await expect(page.locator(`${CLIENT_ID}-div-container div.text-danger`)).toBeVisible();
  await page.locator(".config-btn-provider-submit").last().click();
  await expect.poll(async () => savedProviders(page)).toBe(0);

  // Entering the App ID makes the configuration valid and it is saved as a customization
  await page.locator(CLIENT_ID).pressSequentially("my-app-id");
  await expect(page.locator(CLIENT_ID)).not.toHaveClass(/is-invalid/);
  await expect(page.locator(`${CLIENT_ID}-div-container div.text-danger`)).toBeHidden();
  await page.locator(".config-btn-provider-submit").last().click();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("dashgit-config"))))
    .toMatchObject({ providers: [{ oauth: true, oacustom: { enabled: true, clientId: "my-app-id" } }] });
});

test("develop environment requires the OAuth App ID of a GitLab provider", async ({ page }) => {
  await page.goto("/");
  await addProvider(page, "gitlab");

  await page.locator(AUTH).check();
  await expect(page.locator(CUSTOMIZE)).toBeChecked();
  await expect(page.locator(CUSTOMIZE)).toBeDisabled();
  await expect(page.locator(CLIENT_ID)).toHaveClass(/is-invalid/);
  await page.locator(".config-btn-provider-submit").last().click();
  await expect.poll(async () => savedProviders(page)).toBe(0);
});

test("production environment does not require the OAuth App ID", async ({ page }) => {
  await mockProductionEnvironment(page);
  await page.goto("/");
  await addProvider(page, "github");

  // Enabling OAuth2 is enough, the customization is optional and its inputs remain hidden
  await page.locator(AUTH).check();
  await expect(page.locator(CUSTOMIZE)).not.toBeChecked();
  await expect(page.locator(CUSTOMIZE)).toBeEnabled();
  await expect(page.locator(CLIENT_ID)).toBeHidden();
  await expect(page.locator(TOKEN_URL)).toBeHidden();

  // The configuration is saved without any App ID
  await page.locator(".config-btn-provider-submit").last().click();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("dashgit-config"))))
    .toMatchObject({ providers: [{ oauth: true, oacustom: { enabled: false, clientId: "" } }] });
});

test("production environment allows an empty OAuth App ID when customizing", async ({ page }) => {
  await mockProductionEnvironment(page);
  await page.goto("/");
  await addProvider(page, "github");

  // Customizing shows the inputs, but the App ID is not required as there is a default OAuth app
  await page.locator(AUTH).check();
  await page.locator(CUSTOMIZE).check();
  await expect(page.locator(CLIENT_ID)).toBeVisible();
  await expect(page.locator(CLIENT_ID)).not.toHaveClass(/is-invalid/);

  // Only the exchange token url is customized, the configuration is saved with an empty App ID
  await page.locator(TOKEN_URL).pressSequentially("https://my.proxy/exchange");
  await page.locator(".config-btn-provider-submit").last().click();
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("dashgit-config"))))
    .toMatchObject({ providers: [{ oauth: true, oacustom: { enabled: true, clientId: "", tokenUrl: "https://my.proxy/exchange" } }] });
});
