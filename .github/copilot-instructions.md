# Copilot Instructions for the DashGit Workspace

## Repository summary
This repository contains DashGit, a dashboard application for viewing and managing work items from GitHub and GitLab.

The workspace has three main components:
- `dashgit-updater/`: Java/Maven module that generates combined Dependabot update payloads.
- `dashgit-web/`: client-side web application served from static files, with UI logic, OAuth support, and API access.
- `oauth-exchange/`: OAuth exchange proxy service to avoid exposing client secrets directly from the browser.

## Main structure
- `README.md`: project overview and usage guide.
- `dashgit-updater/pom.xml`: Maven project definition for the updater component.
- `dashgit-web/`: web application code, controllers, views, and tests.
  - `dashgit-web/test/package.json`: test scripts for the web subproject.
  - `dashgit-web/OAUTH2.md`: OAuth2 documentation, PKCE flow, and exchange proxy details.
- `oauth-exchange/package.json`: dependencies for the OAuth proxy service.

## Important notes
- There is no `package.json` at the repository root or directly in `dashgit-web/`.
- The `dashgit-web` subproject is not a typical Node application in the repository root; front-end tests are located under `dashgit-web/test/`.
- The `oauth-exchange` service is described as a lightweight container exposing `/exchange` and requiring environment variables for OAuth client secrets.

## How to use each part

### 1. `dashgit-web`
This is the main DashGit interface.

- Browse and edit code in `dashgit-web/app/` and `dashgit-web/test/`.
- Unit tests:
  - Go to `dashgit-web/test/`.
  - Run: `npm test` or `npm run report`.

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
- Typically deployed as a Docker container with environment variables:
  - `CLIENT_SECRET_<CLIENT_ID>`
  - `TOKEN_URL_<CLIENT_ID>`

## Development context
- The front end uses static HTML/JS in `dashgit-web/app/`.
- Front-end tests use Mocha and Chai in `dashgit-web/test/`.
- The updater backend uses Maven and Java 17.
- OAuth flows are documented in `dashgit-web/OAUTH2.md`.

## Navigation guidance
- For authentication and OAuth logic: `dashgit-web/login/`, `dashgit-web/oauth/`, `dashgit-web/OAUTH2.md`.
- For GitHub/GitLab API access: `dashgit-web/git/`.
- For OAuth flow tests and customization checks: `dashgit-web/test/TestOALogin.js`.
- For Dependabot combine/update logic: `dashgit-updater/src/main/java/`.

## Quick tips
- To run the app in a browser, serve `dashgit-web/` as static files.
- For quick front-end tests, use `dashgit-web/test/package.json`.
- For custom OAuth App development, read `dashgit-web/OAUTH2.md` and use `oauth-exchange/`.

---

*This file was generated to guide use of the DashGit workspace in VS Code and Copilot.*