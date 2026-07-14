import { test, expect } from "@playwright/test";
import { jsonRoute, saveScreenshot } from "./mock-helpers.js";
import { searchInvolved, graphqlStatuses, notifications } from "./workitems.fixtures.js";

/**
 * End-to-end smoke test for the basic synchronous work-items flow: displaying issues and
 * pull requests together with the asynchronous notifications and build statuses that
 * decorate them.
 *
 * No real credentials are used: the three GitHub endpoints the app calls are mocked with
 * page.route, and a GitHub PAT provider is seeded in local storage so the flow fires.
 * The app still loads its libraries (octokit, Bootstrap...) from CDNs, so internet is required.
 *
 * CORS note: the mocked requests are cross-origin (localhost -> api.github.com) and octokit
 * sends an Authorization header, so the browser issues a preflight. The jsonRoute helper (see
 * mock-helpers.js) answers OPTIONS with CORS headers and adds access-control-allow-origin to responses.
 */

const CONFIG = {
  version: 3,
  encrypted: false,
  providers: [
    {
      provider: "GitHub",
      url: "https://github.com",
      user: "smoke-user",
      token: "ghp_smoketoken",
      oauth: false,
      enabled: true,
      enableNotifications: true,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // Catch-all first (lowest priority): any unexpected git-API call fails fast instead of
  // hitting the real network. The specific routes registered afterwards take precedence.
  await page.route(/api\.github\.com/, (route) => route.abort());
  await page.route("**/api.github.com/search/issues*", jsonRoute({ items: searchInvolved }));
  await page.route("**/api.github.com/notifications*", jsonRoute(notifications, { "x-poll-interval": "60" }));
  await page.route("**/api.github.com/graphql", jsonRoute({ data: graphqlStatuses }));

  // Seed a configured provider and open directly on the Involved tab.
  await page.addInitScript((config) => {
    localStorage.setItem("dashgit-config", JSON.stringify(config));
    sessionStorage.setItem("dashgit-config-last-selected-tab", "involved");
  }, CONFIG);
});

// Screenshot each test (pass or fail) for manual verification, saved under e2e/screenshots/.
test.afterEach(async ({ page }, testInfo) => {
  await saveScreenshot(page, testInfo);
});

test("displays issues and PRs with notifications and build statuses", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator("#wi-items-involved_0-github_all");
  await expect(panel).toBeVisible();

  // Work items: one issue and two PRs are rendered
  const issues = panel.locator('tr[itemtype="issue"]');
  const prs = panel.locator('tr[itemtype="pr"]');
  await expect(issues).toHaveCount(1);
  await expect(prs).toHaveCount(2);
  await expect(panel).toContainText("Smoke issue with mention");
  await expect(panel).toContainText("Smoke PR passing");
  await expect(panel).toContainText("Smoke PR failing");
  // Type icons distinguish issues from PRs
  await expect(panel.locator(".fa-circle-dot").first()).toBeVisible();
  await expect(panel.locator(".fa-code-pull-request").first()).toBeVisible();

  // Notifications: mention icon on the issue, bell on the PR, and the Involved-tab badge count
  await expect(page.locator(".wi-notification-icon.fa-at")).toHaveCount(1);
  await expect(page.locator(".wi-notification-icon.fa-bell")).toHaveCount(1);
  await expect(page.locator("#wi-notifications-tab-badge")).toContainText("1");

  // Build statuses: success on the passing PR, failure on the failing PR, no leftover spinners
  await expect(page.locator(".wi-status-icon.fa-check")).toHaveCount(1);
  await expect(page.locator(".wi-status-icon.fa-x")).toHaveCount(1);
  await expect(panel.locator(".spinner-border")).toHaveCount(0);
});
