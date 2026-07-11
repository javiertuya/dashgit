import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the DashGit end-to-end smoke tests.
 *
 * The web app is a set of static files under ../app (no build step), so a static
 * file server (http-server) is launched to serve them and the tests run against it.
 * Note: the app loads some assets from CDNs (jQuery, Bootstrap, crypto-js, esm.sh),
 * so running these tests requires internet access. No GitHub/GitLab credentials are needed.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 30000,
  expect: { timeout: 10000 },
  // Retry in CI to absorb transient CDN/network hiccups (the app loads assets from CDNs)
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    // Record a video of every test run; saved under test-results/ (and uploaded as a CI artifact).
    // Use "retain-on-failure" instead to keep videos only for failing tests.
    video: "on",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Launch the http-server binary directly with node (a single process) instead of
    // through `npx`, which spawns an extra wrapper process that can be left orphaned
    // holding the port when Playwright tears the server down (notably on Windows).
    command: "node node_modules/http-server/bin/http-server ../app -p 8080 -c-1 --silent",
    url: "http://localhost:8080",
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
