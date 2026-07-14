/**
 * Shared Playwright mocking utilities for the DashGit e2e specs.
 *
 * The git-platform APIs are cross-origin (localhost -> api.github.com / gitlab.com) and the clients
 * (octokit, gitbeaker, jQuery ajax) send an Authorization header, so the browser issues a CORS
 * preflight. Every mocked route must therefore answer OPTIONS with CORS headers and add
 * access-control-allow-origin to the real response. These helpers centralize that handling, reused by
 * smoke.spec.js, workitems.spec.js and the review-workflow specs.
 */

import path from "node:path";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "*",
};

// Fulfills a matched route with a JSON body (plus CORS). Use inside branching handlers.
function fulfillJson(route, body, extraHeaders = {}) {
  return route.fulfill({
    status: 200,
    headers: { ...CORS, ...extraHeaders },
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// Answers a CORS preflight (OPTIONS) and returns true so branching handlers can early-return.
function preflight(route) {
  if (route.request().method() === "OPTIONS") {
    route.fulfill({ status: 204, headers: CORS });
    return true;
  }
  return false;
}

// Handler factory for a route that always returns the same JSON body: CORS preflight for OPTIONS,
// otherwise the body (+CORS). Same behaviour previously inlined in workitems.spec.js.
function jsonRoute(body, extraHeaders = {}) {
  return (route) => {
    if (preflight(route)) return;
    return fulfillJson(route, body, extraHeaders);
  };
}

// Safety net: abort any request to the git platform APIs so a test can never depend on live services.
// CDN assets are left untouched. Register this first; specific page.route() calls added afterwards take
// precedence (Playwright matches routes in reverse registration order).
async function blockGitApis(page) {
  await page.route(/(api\.github\.com|github\.com\/search|gitlab\.com\/api)/, (route) => route.abort());
}

// Saves a full-page screenshot for manual verification under e2e/screenshots/, named by spec + test
// title. Call from a test.afterEach hook so it runs whether the test passed or failed (a failing test
// captures the actual on-screen state). The screenshot is also attached to the Playwright HTML report.
async function saveScreenshot(page, testInfo) {
  const spec = path.basename(testInfo.file).replace(/\.spec\.js$/, "");
  const name = testInfo.title.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");
  const file = path.join(path.dirname(testInfo.file), "screenshots", `${spec}__${name}.png`);
  await page.screenshot({ path: file, fullPage: true }); // Playwright creates parent dirs
  await testInfo.attach("screenshot", { path: file, contentType: "image/png" });
}

export { CORS, fulfillJson, preflight, jsonRoute, blockGitApis, saveScreenshot };
