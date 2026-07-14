# AGENTS.md — DashGit

Instructions for AI coding agents working in this repository. Human-facing documentation lives in [README.md](README.md).

## What this project is

DashGit is a browser-based dashboard for viewing and managing work items (issues, pull requests, branches, Dependabot updates, build statuses, notifications) across multiple GitHub and GitLab repositories. It runs entirely in the browser and is hosted on GitHub Pages at https://javiertuya.github.io/dashgit. Authentication uses OAuth2 (Authorization Code + PKCE) or Personal Access Tokens; configuration and tokens live in the browser's local/session storage.

## Repository layout

This is a multi-component workspace. There is **no `package.json` at the repository root** and no root build step.

| Component | Path | Stack | Purpose |
| --------- | ---- | ----- | ------- |
| Web app | `dashgit-web/` | Vanilla JS (ES modules), static HTML/CSS | The DashGit UI — the main component |
| Updater | `dashgit-updater/` | Java 17 / Maven | Generates and applies combined Dependabot update payloads |
| OAuth proxy | `oauth-exchange/` | Node.js / Express 5 | Exchanges OAuth authorization codes for tokens without exposing secrets |

### `dashgit-web/`
- `app/` — the front-end source (this is what you edit). Served as static files; no bundler/transpiler.
  - `index.html` — entry point. External libraries (Octokit, Gitbeaker, Bootstrap) are loaded via CDN + an `importmap`, not from `node_modules`.
  - `core/` — app model and caches: `Config.js`, `Model.js`, `StatusesCache.js`, `StatusIndex.js`, `NotifCache.js`, `LabelsCache.js`, `Surrogates.js`.
  - `git/` — GitHub/GitLab REST + GraphQL adapters and API wrappers (`GitHubAdapter.js`, `GitHubApi.js`, `GitHubGraphql.js`, `GitLab*`, `GitStore*`, `Log.js`).
  - `login/` — login flow, token storage, PAT encryption.
  - `oauth/` — PKCE and OAuth helper functions.
  - `*Controller*.js` / `*View*.js` / `WiServices.js` — UI controllers and rendering for the work-item views and the configuration tab.
  - `assets/` — icons, images, bundled Fontawesome.
  - `package.json` — declares the runtime dependency versions (`@octokit/rest`, `@octokit/graphql`, `@gitbeaker/rest`) that must be kept in sync with the CDN versions pinned in the `importmap` in `index.html`.
- `test/` — Mocha unit tests (see Testing below). Its own `package.json` and `node_modules`.
- `dist/` — **generated output. Do not edit by hand.** Produced by `prepare-release.sh` from `app/` during the release workflow (it copies `app/`, appends `?v=<version>` cache-busting query strings, and stamps the version into `Config.js`).
- `OAUTH2.md` — OAuth2 / PKCE flow and customization documentation.
- `prepare-release.sh` — builds `dist/` for GitHub Pages deployment.

### `dashgit-updater/`
- Java 17, built with Maven; packaged as a `jar-with-dependencies` (main class `giis.dashgit.updater.Main`).
- `src/main/java/giis/dashgit/updater/` — orchestration: `Main`, `UpdaterController`, `DependencyUpdater`, `DependencyUpdaterFacade`, `UpdaterModel`, `ConflictResolver`.
- `src/main/java/giis/qabot/ci/` — git platform clients (`GithubGitClient`, `GitlabClient`, `GithubGraphqlClient`, `GitLocal`) and CI models.
- `src/test/java/giis/dashgit/updater/test/` — tests (see Testing below).
- `it.properties` — configuration for integration tests (test repo names, tokens); generated per-run in CI.

### `oauth-exchange/`
- `server.js` — minimal Express proxy exposing an `/exchange` endpoint. Reads OAuth client secrets and token URLs from environment variables.
- `Dockerfile` — container image for deployment.

## Build, test, and run

### Web app
- **Run locally:** serve `dashgit-web/app/` as static files from any local web server and open `index.html`. There is no build step for development.
- **Unit tests** (Mocha + Chai + Sinon, ES modules) run from `dashgit-web/test/`:
  ```
  cd dashgit-web/test
  npm install
  npm test           # runs: mocha Test*.js
  npm run report     # same, with the mochawesome HTML reporter
  ```
  Tests cover API-response-to-model transformations, rendering, and configuration. Test files are `Test*.js` (e.g. `TestGitHubAdapter.js`, `TestWiViewRender.js`, `TestConfig.js`, `TestOALogin.js`). Some tests compare generated output under `test/actual/` against golden files in `test/expected/`; create `test/actual/` if it does not exist. VS Code Mocha Explorer is preconfigured in `.vscode/settings.json`.
- **End-to-end smoke tests** (Playwright) run from `dashgit-web/e2e/` — a separate, self-contained package that boots the real app in a browser:
  ```
  cd dashgit-web/e2e
  npm install
  npx playwright install chromium   # one-time browser download
  npm test                          # runs: playwright test (all *.spec.js)
  ```
  `playwright.config.js` launches a static server (`http-server`) against `dashgit-web/app/`. Two specs:
  - `smoke.spec.js` — the app boots with empty local storage (all tabs render, "no providers" warning) and a GitHub provider added through the Configure form persists to local storage. Makes no API calls (git-API hosts are blocked in the test).
  - `workitems.spec.js` — the synchronous work-items flow: seeds a GitHub PAT provider in local storage and **mocks the three GitHub endpoints** (`/search/issues`, `/notifications`, `POST /graphql`) with `page.route` to render issues + PRs decorated with notification/mention icons and success/failure build statuses (Involved tab). Mock payloads live in `workitems.fixtures.js`. Because the mocked calls are cross-origin and octokit sends an `Authorization` header, each route must answer the CORS preflight (`OPTIONS`) and add `access-control-allow-origin` to responses.

  **No GitHub/GitLab credentials are needed**, but the app pulls CDN assets (jQuery, Bootstrap, crypto-js, esm.sh) so **internet access is required**. Runs in CI (`test.yml`, job `test-e2e`). Gotchas: the Configure form validates on `keyup`, so type into inputs with `pressSequentially`, not `fill`, or the save is blocked; a seeded PAT `token` must be `ghp_`-prefixed (single search call) and works with `encrypted:false` (stored token passes through). With the VS Code **Playwright Test** extension (`ms-playwright.playwright`, recommended in `.vscode/extensions.json`), the tests appear in the Testing panel and **Debug Test** runs them headed (visible browser) with breakpoints.

### Updater (Java)
From `dashgit-updater/`:
- `mvn test` — runs tests. `TestUt*` are self-contained unit tests (merge-conflict resolution). `TestIt*` integration tests require two dedicated live test repositories and tokens configured via `it.properties` / environment variables — **do not run these blindly**; see the class comments in `TestItGithubLiveUpdates.java`.
- `mvn package` — builds the runnable `jar-with-dependencies`.
- Run a single test class: `mvn test -Dtest=TestUtConflictResolution`.

### OAuth proxy
From `oauth-exchange/`: `npm install` then run `server.js` with the required OAuth environment variables set.

## CI/CD (`.github/workflows/`)
- `test.yml` — on push/PR: `test-ut` (web Mocha tests, Node 24), `test-e2e` (Playwright e2e, Node 24), `sonarqube` analysis, and a `test-it` matrix (GitHub/GitLab integration tests, only when files under `dashgit-updater/**` change).
- `release.yml` — on GitHub Release: runs `prepare-release.sh` and deploys `dashgit-web/dist/` to GitHub Pages.
- Sonar configuration is in `sonar-project.properties` (analyzes `dashgit-web/app` and `dashgit-updater/src/main/java`).
- **Analysis runs on SonarCloud (public project key `my:dashgit`)**, so its API is reachable without auth — no token needed to read results. When the `sonarqube` job fails, `gh run view <id> --log-failed` only shows "Quality Gate has FAILED"; get the actual cause from the public API (URL-encode the `:` as `%3A`):
  - Failing conditions: `curl -sS "https://sonarcloud.io/api/qualitygates/project_status?projectKey=my%3Adashgit&branch=<branch>"` — look for conditions with `"status":"ERROR"` (e.g. `new_code_smells > 0`).
  - The offending issues (new code): `curl -sS "https://sonarcloud.io/api/issues/search?componentKeys=my%3Adashgit&branch=<branch>&resolved=false&inNewCodePeriod=true&types=CODE_SMELL"` — each issue has `rule`, `component`, `line`, `message`. The quality gate requires **zero** new code smells/issues.

## Frontend architecture (`dashgit-web/app`)

The UI is orchestrated by `WiController.js` (work-item views) driving the `git/*Adapter` + `git/*Api` layers and the `WiView*` renderers. The data flow for a view (tab) mixes a synchronous first paint with asynchronous cache-backed refinements:

1. **Synchronous display of work items.** `dispatch(target)` builds one promise per enabled provider calling the REST API (`getWorkItems`), awaits them with `Promise.allSettled` (failed providers are isolated into alerts, the rest still render), and paints the items. Most tabs (assigned, created, involved, unassigned, dependabot) follow this path. The *Branches* tab (`target == "statuses"`) is the exception: it skips the REST promises and renders entirely from the statuses cache.
2. **Asynchronous refinement after paint.** Once items are on screen, `dispatchNotifications(target)` and `dispatchStatuses(target)` fire async calls that fill in the notification and status/build icons and update the UI in place via the `updateNotifications` / `updateStatuses` callbacks. Statuses (branches + build statuses) come from the **expensive GraphQL API**; notifications come from the REST API. Both are cached so a fast tab switch reuses cached data instead of re-calling the APIs.

### Caches (`app/core/`)
- **`StatusesCache.js` — two-level, time-based.** Keyed per provider, holds `{ updateTime, refreshTime, model }`. `hit()` returns true only while *both* windows are valid: within `statusCacheUpdateTime` (short — serve cache as-is, no API call) and within `statusCacheRefreshTime` (long — full refresh due). Between the two, `updateSince()` returns a timestamp so the controller does an **incremental** update (only repos with recent commits) and `mergeBranchesAndPrs` merges it in; past the long window it forces a **full refresh**. Both windows are user-configurable (Configuration tab). `scheduleNearRefresh()` shortens the next refresh after a failed GraphQL call. `StatusIndex.js` is a flat index of the cached statuses for direct lookup during rendering.
- **`NotifCache.js` — model cache consumed synchronously.** Stores the latest notification per provider keyed by model UID (repo/type/iid). Filled by the async notification calls and read synchronously the next time work items render, so notification icons appear immediately on a re-render.
- **GitHub notification poll-interval control (in `git/GitHubApi.js`, `notifLastModified`/`notifPollInterval`).** A second layer specific to GitHub notifications: GitHub's REST API dictates a minimum poll interval (`x-poll-interval` header, default 120s). Within that interval `updateNotificationsAsync` does **not** hit the API — it calls `updateNotifications(provider, null)`, which reuses the model already in `NotifCache`. So GitHub notifications are effectively cached at two levels: the API-call throttle (don't fetch too often) and the model cache (`NotifCache`, reuse the last fetched model). **GitLab has no equivalent poll-interval throttle** — `GitLabApi.updateNotificationsAsync` (backed by `TodoLists`) hits the API on every refresh; it only benefits from the `NotifCache` model layer.
- **`LabelsCache.js`** — caches label colors (mainly for GitLab, whose items only carry label names).
- **`Surrogates.js`** — when several providers share the same authenticated user on the same platform, one *surrogate* issues the expensive GraphQL/notification calls and the others read its cached model, avoiding duplicate calls. All the caches above resolve through `surrogates` when reading a model.

`WiController.reset(hard)` invalidates these caches on reload: a soft reset only invalidates `statusesCache` update times; a hard reset also clears `notifCache`, `statusIndex`, and `labelsCache`.

## Conventions and gotchas
- **Edit `dashgit-web/app/`, never `dashgit-web/dist/`** — `dist/` is regenerated on release.
- The web app is **plain ES modules with no bundler**. Keep imports relative and browser-compatible; do not introduce Node-only APIs into `app/`. External dependency versions must match between `app/index.html`'s `importmap` and `app/package.json`.
- GitHub and GitLab support is generally mirrored: when changing behavior in a `GitHub*` file, check whether the corresponding `GitLab*` file needs the same change (and vice versa), and the same for the updater's `Github*`/`Gitlab*` clients.
- Branch/status data uses the GraphQL API (with a two-level cache in `core/StatusesCache.js`); most other work-item data uses the REST API. See README "Status cache configuration".
- **Assigned review-workflow badges** (`git/GitHubApi.js` + `WiViewRender.actions2html`): extra search queries decorate PRs in the Assigned view with `custom_actions` badges — `review_request` (I'm a requested reviewer), `changes_requested` (I authored a PR with changes requested), `pending_merge` (approved-but-open PR I authored or reviewed; opt-out per provider via `enablePendingMerge`). **The Assigned view also surfaces ALL my open authored PRs** (`authored` query `is:open is:pr author:me`, deduped/merged with the above by `wiServices.merge`) so it reflects everything I am working on — mirror of GitLab, keeping Assigned the single "what needs my action" list. Because the search API can't tell "whose turn it is" nor return the requested reviewers, an async GraphQL refinement after paint (`WiController.dispatchReviewStates` → `dispatchGitHubReviewStates` → `GitHubApi.updateReviewStatesAsync` → `GitHubGraphql.getReviewRequestsQuery` → `GitHubAdapter.reviewRequests2decisions` → `WiController.updateReviewStates`) reads each PR's pending `reviewRequests` and, per role carried on the item: (a) role `changes_requested` → `WiView.muteChangesRequestedBadge` mutes the `changes_requested` badge to "in review" once I re-requested review (`reviewRequests` not empty); (b) role `author` (my other open PRs, no `changes_requested`, not `pending_merge`) → `WiView.setInReviewBadge` injects a muted `in_review` badge when a review is pending (reviewers assigned, none has requested changes). So an authored PR shows: no badge when created with no reviewers, `in_review` while under review, `changes_requested` when a reviewer wants changes, `in_review` again after I re-request, and `pending_merge` once approved. **GitLab mirrors the full workflow on both roles.** Because GitLab has no server-side "changes requested" filter and its `reviewer_username`/authored queries keep returning MRs regardless of "whose turn it is", the Assigned view surfaces (a) MRs where I'm a reviewer (`review_request`), (b) my own authored MRs — those with reviewers get a muted `in_review` badge synchronously (`GitLabApi.wrapAuthoredReviewCall` → `GitLabAdapter.addInReviewActionToMergeRequests`), (authored MRs are already surfaced, so nothing extra to fetch). One async GraphQL refinement (`GitLabApi.updateReviewStatesAsync` → `GitLabGraphql.getReviewStatesQuery` → `GitLabAdapter.reviewStates2decisions` → `WiController.updateReviewRequestStates`) reads each MR's `approvedBy.nodes` and `reviewers.nodes[].mergeRequestInteraction.reviewState` and decides, in precedence order: (1) `pendingMerge` (either role, only when `enablePendingMerge`) when there is ≥1 approval and no reviewer requests changes → `WiView.setPendingMergeBadge` shows the green `pending_merge` badge (mirror of GitHub `review:approved`); (2) reviewer → `WiView.muteReviewRequestBadge` mutes `review_request` to "changes requested" when *my* state is `REQUESTED_CHANGES`; (3) author → `WiView.activateChangesRequestedBadge` upgrades the muted `in_review` badge to an active `changes_requested` when *any* reviewer is `REQUESTED_CHANGES`. Unlike GitHub, GitLab derives `pending_merge` from this GraphQL (no reliable REST approval filter — `approved_by_usernames`/`_ids` is an array param whose `Any` value gitbeaker did not serialize correctly, returning everything). When `enablePendingMerge` is on the async covers ALL my authored MRs (an approved MR may have no assigned reviewers); when off, only those under review. GitLab resets `reviewState` to `UNREVIEWED` on re-request, so badges return to their muted state naturally.
- Advanced features (combined Dependabot updates, follow-ups) require a separate user-owned *manager repository*; the updater's payload format and the web app's push logic (`git/GitStore*`) must stay compatible.
- Default branch is `main`; active development happens on `develop`.
- Contribution policy follows the giis-uniovi org guidelines: https://github.com/giis-uniovi/.github/blob/main/profile/CONTRIBUTING.md
