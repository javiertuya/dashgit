# Copilot Instructions for the DashGit Workspace

## Repository summary
This repository contains DashGit, a dashboard application for viewing and managing work items from GitHub and GitLab.

The workspace has three main components:
- `dashgit-updater/`: Java/Maven module that generates combined Dependabot update payloads.
- `dashgit-web/`: client-side web application served as static files, with UI logic, OAuth support, and GitHub/GitLab API integration.
- `oauth-exchange/`: lightweight OAuth exchange proxy service used by the browser client to avoid exposing secrets.

## What we learned recently
- `dashgit-web/` is not a typical single-package Node app at the root; the client app lives under `dashgit-web/app/`.
- There is a `package.json` inside `dashgit-web/app/`, and tests are configured in `dashgit-web/test/package.json`.
- The front end is vanilla JS with static assets, so local serving is the normal way to run it.
- OAuth and API handling is split into `dashgit-web/app/login/`, `dashgit-web/app/oauth/`, and `dashgit-web/app/git/`.
- The `oauth-exchange` service is a simple Express proxy in `oauth-exchange/server.js`.

## Main structure
- `README.md`: project overview and usage guide.
- `dashgit-updater/pom.xml`: Maven project definition for the updater component.
- `dashgit-web/app/package.json`: package metadata for the front-end app.
- `dashgit-web/test/package.json`: front-end test scripts.
- `dashgit-web/OAUTH2.md`: OAuth2 documentation, PKCE flow, and exchange proxy details.
- `oauth-exchange/package.json`: dependencies for the OAuth proxy service.

## Important notes
- There is no `package.json` at the repository root.
- The `dashgit-web` subproject uses static HTML/JS and does not require a Node build step at the workspace root.
- The front-end app code is under `dashgit-web/app/`, while test harnesses and fixtures are under `dashgit-web/test/`.
- `oauth-exchange` is a minimal proxy that exposes `/exchange` and depends on environment variables for OAuth client secrets.

## How to use each part

### 1. `dashgit-web`
This is the main DashGit interface.

- Browse and edit code in `dashgit-web/app/` and `dashgit-web/test/`.
- Key front-end code areas:
  - `dashgit-web/app/git/`: GitHub/GitLab API adapters and GraphQL wrappers.
  - `dashgit-web/app/login/`: login flow, token storage, and encryption.
  - `dashgit-web/app/oauth/`: PKCE and OAuth helper functions.
- Unit tests:
  - Go to `dashgit-web/test/`.
  - Run: `npm test` or `npm run report` from `dashgit-web/test/`.

### 2. `dashgit-updater`
This is a Java/Maven project for the Dependabot update manager.

- Location: `dashgit-updater/`.
- Common commands:
  - `mvn test`
  - `mvn package`

### 3. `oauth-exchange`
This is an OAuth proxy service for exchanging authorization codes for access tokens.

- Location: `oauth-exchange/`.
- Contains a `package.json` with dependencies on `express`, `node-fetch`, and `cors`.
- Entry point: `oauth-exchange/server.js`.
- Requires environment variables for OAuth client secrets and token URLs.

## Development context
- The front end uses static HTML/JS served from `dashgit-web/app/index.html`.
- Front-end tests use Mocha and Chai in `dashgit-web/test/`.
- The updater backend uses Maven and Java 17.
- OAuth flows are documented in `dashgit-web/OAUTH2.md`.

## Navigation guidance
- For authentication and OAuth logic: `dashgit-web/app/login/`, `dashgit-web/app/oauth/`, `dashgit-web/OAUTH2.md`.
- For GitHub/GitLab API access: `dashgit-web/app/git/`.
- For OAuth flow tests: `dashgit-web/test/TestOALogin.js`.
- For feed and issue list rendering: `dashgit-web/app/WiController*.js` and `dashgit-web/app/WiView*.js`.
- For Dependabot combine/update logic: `dashgit-updater/src/main/java/`.

## Quick tips
- To run the app in a browser, serve `dashgit-web/` as static files from a local web server.
- Use `dashgit-web/app/package.json` and `dashgit-web/test/package.json` to inspect client and test dependencies.
- For custom OAuth App development, read `dashgit-web/OAUTH2.md` and use `oauth-exchange/`.
- For debugging GitHub/GitLab integration, start in `dashgit-web/app/git/` and `dashgit-web/test/` fixtures.

---

*This file was updated to reflect recent findings about the DashGit workspace layout and front-end app structure.*
