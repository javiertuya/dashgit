/**
 * Mock API payloads for the work-items e2e smoke test (workitems.spec.js).
 *
 * Self-contained and coherent: one repo `smoke-user/repo-a` with an issue and two PRs.
 * The GraphQL PRs share repo + number with the search PRs so their build-status icons
 * bind to the displayed rows; the notifications reference the same items so their
 * mention/bell icons attach. Shapes mirror the real GitHub REST/GraphQL responses
 * (see dashgit-web/test/input/*.json and the adapters in app/git/GitHubAdapter.js).
 */

// GET /search/issues -> response.data.items (an item is a PR iff it has `pull_request`)
const searchInvolved = [
  {
    repository_url: "https://api.github.com/repos/smoke-user/repo-a",
    html_url: "https://github.com/smoke-user/repo-a/issues/11",
    number: 11,
    title: "Smoke issue with mention",
    user: { login: "another-user" },
    labels: [{ name: "bug", color: "d73a4a" }],
    state: "open",
    assignees: [{ login: "smoke-user" }],
    created_at: "2024-01-08T14:49:48Z",
    updated_at: "2024-01-08T14:49:49Z",
  },
  {
    repository_url: "https://api.github.com/repos/smoke-user/repo-a",
    html_url: "https://github.com/smoke-user/repo-a/pull/12",
    number: 12,
    title: "Smoke PR passing",
    user: { login: "smoke-user" },
    labels: [],
    state: "open",
    assignees: [{ login: "smoke-user" }],
    created_at: "2024-01-09T19:56:21Z",
    updated_at: "2024-01-10T17:27:30Z",
    pull_request: { html_url: "https://github.com/smoke-user/repo-a/pull/12" },
  },
  {
    repository_url: "https://api.github.com/repos/smoke-user/repo-a",
    html_url: "https://github.com/smoke-user/repo-a/pull/13",
    number: 13,
    title: "Smoke PR failing",
    user: { login: "smoke-user" },
    labels: [{ name: "invalid", color: "e4e669" }],
    state: "open",
    assignees: [],
    created_at: "2024-01-08T12:52:35Z",
    updated_at: "2024-01-08T12:52:56Z",
    pull_request: { html_url: "https://github.com/smoke-user/repo-a/pull/13" },
  },
];

// POST /graphql -> body is { data: <this> }. PR numbers/repo match the search PRs.
const graphqlStatuses = {
  viewer: {
    login: "smoke-user",
    resourcePath: "/smoke-user",
    url: "https://github.com/smoke-user",
    repositories: {
      nodes: [
        {
          name: "repo-a",
          nameWithOwner: "smoke-user/repo-a",
          url: "https://github.com/smoke-user/repo-a",
          pullRequests: {
            edges: [
              {
                node: {
                  title: "Smoke PR passing",
                  number: 12,
                  url: "https://github.com/smoke-user/repo-a/pull/12",
                  state: "OPEN",
                  createdAt: "2024-01-09T19:56:21Z",
                  updatedAt: "2024-01-10T17:27:30Z",
                  baseRepository: { nameWithOwner: "smoke-user/repo-a" },
                  headRepository: { nameWithOwner: "smoke-user/repo-a" },
                  headRefName: "branch-pr12",
                  statusCheckRollup: { state: "SUCCESS" },
                },
              },
              {
                node: {
                  title: "Smoke PR failing",
                  number: 13,
                  url: "https://github.com/smoke-user/repo-a/pull/13",
                  state: "OPEN",
                  createdAt: "2024-01-08T12:52:35Z",
                  updatedAt: "2024-01-08T12:52:56Z",
                  baseRepository: { nameWithOwner: "smoke-user/repo-a" },
                  headRepository: { nameWithOwner: "smoke-user/repo-a" },
                  headRefName: "branch-pr13",
                  statusCheckRollup: { state: "FAILURE" },
                },
              },
            ],
          },
          refs: { nodes: [] },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};

// GET /notifications -> response.data (array). Mention on the issue drives the tab badge.
const notifications = [
  {
    subject: { type: "Issue", url: "https://api.github.com/repos/smoke-user/repo-a/issues/11" },
    reason: "mention",
    repository: { full_name: "smoke-user/repo-a" },
  },
  {
    subject: { type: "PullRequest", url: "https://api.github.com/repos/smoke-user/repo-a/pull/12" },
    reason: "subscribed",
    repository: { full_name: "smoke-user/repo-a" },
  },
];

export { searchInvolved, graphqlStatuses, notifications };
