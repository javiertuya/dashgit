import { test } from "@playwright/test";
import { blockGitApis, jsonRoute, preflight, fulfillJson, saveScreenshot } from "./mock-helpers.js";
import { expectWorkflow } from "./review-workflow.js";
import { gitlabMergeRequestsForQuery, gitlabReviewStates, gitlabEmptyProjects, gitlabConfig } from "./review-gitlab.fixtures.js";

/**
 * End-to-end coverage of the GitLab review workflow badges in the Assigned tab.
 *
 * The same S1-S5 lifecycle as the GitHub spec, asserted from the author and reviewer perspectives (see
 * review-workflow.js for the shared matrix). On GitLab the base badges come from REST wrappers and one
 * async reviewStates GraphQL query mutes/activates them or shows pending_merge. The REST merge_requests
 * endpoint is hit three times (assignee/author/reviewer usernames); the GraphQL endpoint serves both the
 * statuses query (returned empty) and the reviewStates query. No real credentials are used; the app loads
 * its libraries from CDNs, so internet is required.
 */

async function setup(page, perspective) {
  await blockGitApis(page); // safety net; specific routes below take precedence

  // REST merge requests: branch on the query param (assignee/author/reviewer username).
  await page.route("**/gitlab.com/api/v4/merge_requests*", (route) => {
    if (preflight(route)) return;
    return fulfillJson(route, gitlabMergeRequestsForQuery(perspective, route.request().url()));
  });
  await page.route("**/gitlab.com/api/v4/issues*", jsonRoute([]));
  await page.route("**/gitlab.com/api/v4/todos*", jsonRoute([]));

  // GraphQL (form-encoded): reviewStates refinement vs the statuses projects query (returned empty).
  await page.route("**/gitlab.com/api/graphql", (route) => {
    if (preflight(route)) return;
    const query = new URLSearchParams(route.request().postData() || "").get("query") || "";
    if (query.includes("mergeRequest(iid:"))
      return fulfillJson(route, gitlabReviewStates(query));
    return fulfillJson(route, gitlabEmptyProjects());
  });

  await page.addInitScript((config) => {
    localStorage.setItem("dashgit-config", JSON.stringify(config));
    sessionStorage.setItem("dashgit-config-last-selected-tab", "assigned");
  }, gitlabConfig(perspective));
}

// Screenshot each test (pass or fail) for manual verification, saved under e2e/screenshots/.
test.afterEach(async ({ page }, testInfo) => {
  await saveScreenshot(page, testInfo);
});

test("author sees the review workflow badges in Assigned", async ({ page }) => {
  await setup(page, "author");
  await page.goto("/");
  await expectWorkflow(page, "0-gitlab", "gitlab", "author");
});

test("reviewer sees the review workflow badges in Assigned", async ({ page }) => {
  await setup(page, "reviewer");
  await page.goto("/");
  await expectWorkflow(page, "0-gitlab", "gitlab", "reviewer");
});
