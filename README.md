[![Status](https://github.com/javiertuya/dashgit/actions/workflows/test.yml/badge.svg)](https://github.com/javiertuya/dashgit/actions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=my%3Adashgit&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=my%3Adashgit)
[![Run DashGit](https://img.shields.io/badge/%20-Run_DashGit-orange)](https://javiertuya.github.io/dashgit)

# DashGit - A Dashboard for GitHub and GitLab repos

[Overview](#overview)
| [Quick Start](#quick-start)
| [Features and Configuration](#features-and-configuration)
| [Advanced Features](#advanced-features)
| [Combined Dependabot Updates](#combined-dependabot-updates)
| [Follow-up](#follow-up)
| [Contributing](contributing)


## Overview

This dashboard offers:
- A unified view of multiple GitHub and GitLab repositories.
- Multiple perspectives on your work items, including:
  - Open issues and pull requests
  - Review requests and requests for changes
  - Branches and Dependabot updates
- Build statuses for PRs/granches and notifications
- The ability to automatically combine Dependabot updates into a single pull request per repository and merge them with just a few clicks
- The option to flag work items with a reminder date for follow-up.

DashGit works entirely in the browser and is hosted on GitHub Pages at
[https://javiertuya.github.io/dashgit](https://javiertuya.github.io/dashgit).
The only data sent outside the browser is what is required to request repository information about your work items.

Below is an example view of DashGit configured to manage two GitHub and one GitLab repositories:

![dashgit-image](dashgit-web/app/assets/image.png "DashGit image")

## Quick Start

To get started, go to [https://javiertuya.github.io/dashgit](https://javiertuya.github.io/dashgit),
open the Configure tab, and specify a GitHub provider by entering your username and an access token:
- Use a personal access token (classic) with `repo` and `notifications` permissions
  (see below for how to narrow the scope of tokens or use fine-grained tokens).
- Leave other parameters at their default values.
- You can omit the token, but this will subject you to lower rate limits and will not allow you to view the branches tab, build statuses, or notifications.

The configuration is stored in your browser's local memory.
To protect your tokens, you can encrypt them with a password, which will be requested when you open a new DashGit browser tab.

## Features and Configuration

The different *views* (tabs) in the UI display open *work items* (issues, pull requests, etc.) in a collapsible panel for each *provider*.
A provider is defined by a repository type (GitHub, GitLab), a *user*, and an access *token* to authenticate requests.
You can define any combination (e.g., providers with the same username but different tokens, or different usernames but the same token).

### API access token permissions
Each tab in DashGit issues different API calls to the repository APIs to get issues, pull requests, notifications, branches, and build statuses,
which require different permission levels.
Below, the token permissions are described for different scenarios:

- **GitHub authenticated with personal access tokens (classic):**
  - To access public and private repositories: `repo` and `notifications` permissions (recommended).
  - To access public repositories and private repositories owned by you, but not other repositories where you are a collaborator:
    `repo:status`, `repo:public_repo`, and `notifications`
- **GitHub authenticated with fine-grained tokens:** Note that at the time of writing this documentation, the fine-grained token feature is still in beta:
  - Currently, private repositories not owned by you cannot be accessed using fine-grained tokens
    (see below for accessing private organization repositories).
  - To access public repositories and private repositories owned by you, but not other repositories where you are a collaborator:
    Set read-only repository permissions: `Commit statuses`, `Contents`, `Issues`, `Metadata`, `Pull requests`.
    You should also set the `Notifications` permission; however, this is not yet supported (even though the documentation mentions it).
    As a result, you will not be able to see notifications/mentions.
- **GitHub authenticated with fine-grained tokens to access organization repositories:**
  You can access private organization repositories provided that:
  - The organization has enabled fine-grained tokens.
  - When creating the token, you specify the organization as the **resource owner**.
  - The token has the aforementioned permissions: `Commit statuses`, `Contents`, `Issues`, `Metadata`, `Pull requests`
    (and `Notifications` when available).
- **GitLab:** Set a personal access token with `api` permission.

### API access token encryption
As mentioned above, the configuration is stored in the browser's local memory and all processing occurs in the browser.
To protect sensitive information (the access tokens), the user is given the option to encrypt the tokens using a password.
If you set a password, the next time you open DashGit you will be asked for it.

If you forget the password, you are given the option to skip. In that case, you may notice that API calls fail: you should go
to the configuration to reset the tokens.
Note that once a token is encrypted, you can't decrypt it, only reset it.

### Selecting, sorting, and grouping
The user can customize how work items are sorted and organized by using the controls at the top of the header.
An additional option allows you to restrict the displayed items to repositories that match a specified search criterion.
These settings are not stored in the configuration.

### Scope configuration
The *username* is the reference user for whom the work items are displayed (assigned to, created by, etc.),
and the token defines the scope of the request that determines what items are displayed.
Note that the username can be someone other than the token owner.

- The scope of Assigned, Involved, and Created views is any repository visible to the token.
- The scope of Triage (unassigned) and Dependabot views is restricted to the repository of the token owner.
  If you need to include other users or organizations, you must set them in the `Add owners to unassigned`
  or `Add owners to dependabot` parameters, respectively.
- The scope of the Branches view is handled differently, as data is obtained by GraphQL API requests instead of the REST API.
  On GitHub, you have to specify one or more of the following scopes: OWNER, ORGANIZATION_MEMBER, or COLLABORATOR.
  Optionally, you can include PRs from other repositories even if they are out of scope.

### Filtering configuration
Requests made against the repositories retrieve the most recent work items that fit on a single response page,
which is enough for the most common use case to display open work items for the user.
Moreover, the displayed data can be restricted by setting any of the following parameters:
- `Max age`: Filters out work items that are older than the specified number of days.
- `Filter if Label`: Filters out work items that contain the specified label.

### Status cache configuration
Requests to the GraphQL API to get branches and build statuses are expensive if they retrieve data
from many repositories and are subject to more restrictive rate limits than the REST API.
To mitigate potential problems with API rate limits and improve UI response times, these calls are cached and managed
by two parameters (measured in seconds) that you can adjust in the Configuration tab:
- `Status Cache Update Time`: During this period, any call to get statuses returns the cached data.
  This avoids making API calls when the user moves from one view to another in a short period of time.
  When this period expires, the cache will be incrementally updated by requesting
  data only from projects that had recent commits.
- `Status Cache Refresh Time`: This specifies a much longer period than `Status Cache Update Time`.
  When this period expires, the cache is fully refreshed.


## Advanced Features

These features require a bit more configuration:
- Combined Dependabot updates: Automatically combine and merge multiple Dependabot updates.
- Manage follow-ups: Select work items for follow-up and display reminders in the *Assigned* tab.

Because DashGit works entirely in the browser without a backend server, you must set up a dedicated (private) repository—called the *manager repository*—before using these features:
- Create the manager repository in GitHub: It is recommended to keep it private, since although no token is sent to it, the logs may contain sensitive information such as URLs or usernames when accessing private or on-premises repositories.
- Enable the manager repository: Go to the Configure tab and check *Enable a Manager Repository for advanced functions*.
  Provide the name of the manager repository (OWNER/REPO) and the token used to push the combined updates or follow-up payload.

### Combined Dependabot Updates

From the Dependabot tab, you can combine pull requests with dependency updates generated by Dependabot into a single PR per repository and merge all of them automatically with just a few clicks.

After you select and confirm the updates to be combined, DashGit pushes a JSON file with this information to the manager repository (*update payload*).
Then, the manager repository runs a GitHub Actions workflow to create each combined pull request, resolve merge conflicts with adjacent lines, and enable automerge.
The combined PR will be merged if the build is successful.

This requires the previous setup of the manager repository (see above) and a bit of additional configuration:
- Configure the workflow: Go to the Dependabot tab and follow the instructions to obtain the content of `.github/workflows/manage-updates.yml`. Add this file to the manager repository.
- Set the API access tokens: In each provider on the Dependabot view, you will see the name of a token. Create these tokens in the manager repository. Their stored value must be a token used to create the combined PRs.

Notes:
- On GitLab, projects have automerge enabled by default, but on GitHub you need to explicitly enable it per repository from Settings > General. It is recommended to activate the automatic deletion of head branches when PRs are merged.
- On GitHub, to automerge when the build succeeds, you must configure the repository to require status checks to pass before merging. To do this, create a branch protection rule on the main branch, check this option, and specify the checks that must pass.
- On GitLab, you can generate Dependabot updates using the [Dependabot Script](https://github.com/dependabot/dependabot-script) or [this more customized version of Dependabot Script](https://github.com/javiertuya/dependabot-script).

### Follow-up

The *Follow up* view displays all work items that you have flagged for follow-up.
You can flag any work item from any view by clicking the left icon(s) and entering the time when you want to see a reminder (in days from today).
You can specify an optional message to display in the follow-up label (the text *follow up* will be displayed by default).
Work items whose reminder date has arrived appear in the *Assigned* tab even if you are not the assignee or reviewer.

This requires the previous setup of the manager repository (see above).
Work items flagged for follow-up are stored in the *manager repository* in a dedicated branch named `dashgit/follow-up` that should not be deleted.

## Contributing

This repository follows the general contribution policies and guidelines of the giis-uniovi organization:
[CONTRIBUTING.md](https://github.com/giis-uniovi/.github/blob/main/profile/CONTRIBUTING.md)

If you plan to contribute, please first create an issue to discuss the approach before starting development.

### Testing

The following table summarizes the test strategy (explained below):

| Feature\\Test level | Unit | Integration | System (E2E) |
| :------------------ | :--: | :---------: | :----------: |
| View work items     | (1)  |            | (5)          |
| Configuration       | (1)  |            | (5)          |
| Combined updates    |      | (2)        | (4)          |
| Merge conflicts     | (3)  | (2)        |              |

1. View work items & configuration: Mocha tests in `dashgit-web/test-web/test`.
   Transformations from API responses to the model displayed in the UI and functions related to the configuration.
   Run in CI, job `test-ut`.
2. Combined updates: JUnit tests in `dashgit-updater`: `TestIt*`.
   Covers GitHub and GitLab, with and without merge conflicts.
   Requires a previous configuration of two dedicated test repos; see `TestItGithubLiveUpdates.java` for instructions and the subclass `TestItGitlabLiveUpdates.java`.
   Run in CI, matrix jobs `test-it *`.
3. Merge conflicts: JUnit tests in `dashgit-updater`: `TestUt*`.
   Covers different situations related to the resolution of git merge conflicts.
   Run in CI as part of the IT jobs.
4. Combined updates: Only automates the test data preparation using a JUnit test in `dashgit-updater`: `TestE2eLiveUpdatesSetup.java`.
   Follow the instructions in this test class.
5. Manual tests: Not yet automated.
