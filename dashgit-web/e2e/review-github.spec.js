import { test } from "@playwright/test";
import { blockGitApis, jsonRoute, preflight, fulfillJson, saveScreenshot } from "./mock-helpers.js";
import { expectWorkflow } from "./review-workflow.js";
import { githubItemsForQuery, githubReviewRequests, githubEmptyStatuses, githubConfig } from "./review-github.fixtures.js";

/**
 * End-to-end coverage of the GitHub review workflow badges in the Assigned tab.
 *
 * A single PR lifecycle (S1-S5, one PR per state) is asserted from the two stakeholder perspectives:
 * the author (provider seeded with the author user) and the reviewer (seeded with the reviewer user).
 * The expected badge per state/perspective lives in review-workflow.js (shared with the GitLab spec).
 *
 * On GitHub the base badges are produced synchronously by separate /search/issues queries (including my
 * authored PRs, so what I am working on shows in Assigned) and the async GraphQL reviewRequests refinement
 * adds the "in review" badge to an authored PR under review (S2) and mutes "changes requested" -> "in
 * review" once I re-requested review (S4). No real credentials are used; the app still loads its libraries
 * from CDNs, so internet is required.
 */

async function setup(page, perspective) {
  await blockGitApis(page); // safety net; specific routes below take precedence

  // Search API: return the items GitHub would surface for this query and seeded user.
  await page.route("**/api.github.com/search/issues*", (route) => {
    if (preflight(route)) return;
    const q = new URL(route.request().url()).searchParams.get("q");
    return fulfillJson(route, { items: githubItemsForQuery(perspective, q) });
  });

  // GraphQL: reviewRequests refinement (mutes S4) vs the statuses query (returned empty).
  await page.route("**/api.github.com/graphql", (route) => {
    if (preflight(route)) return;
    const body = route.request().postData() || "";
    if (body.includes("reviewRequests"))
      return fulfillJson(route, githubReviewRequests(body));
    return fulfillJson(route, githubEmptyStatuses(perspective === "author" ? "author-user" : "reviewer-user"));
  });

  await page.route("**/api.github.com/notifications*", jsonRoute([], { "x-poll-interval": "60" }));

  await page.addInitScript((config) => {
    localStorage.setItem("dashgit-config", JSON.stringify(config));
    sessionStorage.setItem("dashgit-config-last-selected-tab", "assigned");
  }, githubConfig(perspective));
}

// Screenshot each test (pass or fail) for manual verification, saved under e2e/screenshots/.
test.afterEach(async ({ page }, testInfo) => {
  await saveScreenshot(page, testInfo);
});

test("author sees the review workflow badges in Assigned", async ({ page }) => {
  await setup(page, "author");
  await page.goto("/");
  await expectWorkflow(page, "0-github", "github", "author");
});

test("reviewer sees the review workflow badges in Assigned", async ({ page }) => {
  await setup(page, "reviewer");
  await page.goto("/");
  await expectWorkflow(page, "0-github", "github", "reviewer");
});
