/**
 * Mock GitHub API payloads for review-github.spec.js.
 *
 * One PR per workflow state (S1-S5), all in repo acme/repo, authored by AUTHOR and reviewed by REVIEWER.
 * GitHub surfaces the review badges SYNCHRONOUSLY through separate /search/issues queries (the app tags
 * the returned items via GitHubAdapter.addActionToPullRequestItems), and refines them ASYNCHRONOUSLY with
 * a GraphQL reviewRequests query that mutes "changes requested" once the author re-requested review.
 *
 * `githubItemsForQuery` returns, for a given seeded user (perspective) and search `q`, the items that
 * GitHub would really return for that query — so which state is visible per stakeholder matches reality
 * (see the matrix in review-workflow.js).
 */

import { STEPS } from "./review-workflow.js";

const AUTHOR = "author-user";
const REVIEWER = "reviewer-user";
const OWNER = "acme";
const REPO = "repo";

// Fixed PR number per state; S4 is the re-requested one whose GraphQL reviewRequests come back non-empty.
const NUMBERS = { S1: 101, S2: 102, S3: 103, S4: 104, S5: 105 };

const TITLE = Object.fromEntries(STEPS.map((s) => [s.key, s.title]));

function ghItem(key) {
  const n = NUMBERS[key];
  return {
    repository_url: `https://api.github.com/repos/${OWNER}/${REPO}`,
    html_url: `https://github.com/${OWNER}/${REPO}/pull/${n}`,
    number: n,
    title: TITLE[key],
    user: { login: AUTHOR },
    labels: [],
    state: "open",
    assignees: [],
    created_at: "2024-01-08T12:00:00Z",
    updated_at: "2024-01-08T12:30:00Z",
    pull_request: { html_url: `https://github.com/${OWNER}/${REPO}/pull/${n}` },
  };
}

// Items returned for a /search/issues `q`, depending on the seeded stakeholder. Branch on the most
// specific token first (reviewed-by: before the generic review:approved) to avoid returning the same
// state from two queries (which would duplicate rows/DOM ids).
function githubItemsForQuery(perspective, q) {
  if (!q) return [];
  if (perspective === "author") {
    if (q.includes("user-review-requested:")) return []; // author is not a requested reviewer
    if (q.includes("review:changes_requested")) return [ghItem("S3"), ghItem("S4")];
    if (q.includes("reviewed-by:")) return []; // mergeReviewer: author did not review
    if (q.includes("review:approved")) return [ghItem("S5")]; // mergeAuthor: author:USER review:approved
    return []; // assigned (S1,S2 not surfaced to the author on GitHub)
  }
  // reviewer perspective
  if (q.includes("user-review-requested:")) return [ghItem("S2"), ghItem("S4")];
  if (q.includes("review:changes_requested")) return []; // reviewer did not author
  if (q.includes("reviewed-by:")) return [ghItem("S5")]; // mergeReviewer: reviewed-by:USER review:approved
  if (q.includes("review:approved")) return []; // mergeAuthor: author:USER (reviewer isn't the author)
  return []; // assigned
}

// Response for the async GraphQL getReviewRequestsQuery. octokit graphql() returns the `data` object, so
// the mock body is { data: { <alias>: { pullRequest: { reviewRequests: { nodes } } } } }. Only S4 (the
// re-requested PR) has a pending review request, so its badge gets muted to "in review".
function githubReviewRequests(rawPostData) {
  const query = JSON.parse(rawPostData).query;
  const re = /(\w+):\s*repository\(owner:\s*"[^"]+",\s*name:\s*"[^"]+"\)\s*\{\s*pullRequest\(number:\s*(\d+)\)/g;
  const data = {};
  let m;
  while ((m = re.exec(query)) !== null) {
    const alias = m[1];
    const n = parseInt(m[2], 10);
    const nodes = n === NUMBERS.S4 ? [{ requestedReviewer: { login: REVIEWER } }] : [];
    data[alias] = { pullRequest: { number: n, reviewRequests: { nodes } } };
  }
  return { data };
}

// Empty statuses GraphQL response (viewer with no repositories) -> the async statuses refinement no-ops
// and does not interfere with the review badges.
function githubEmptyStatuses(user) {
  return {
    data: {
      viewer: {
        login: user,
        resourcePath: `/${user}`,
        url: `https://github.com/${user}`,
        repositories: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    },
  };
}

function githubConfig(perspective) {
  const user = perspective === "author" ? AUTHOR : REVIEWER;
  return {
    version: 3,
    encrypted: false,
    providers: [
      {
        provider: "GitHub",
        url: "https://github.com",
        user,
        token: "ghp_reviewtoken",
        oauth: false,
        enabled: true,
        enableNotifications: true,
      },
    ],
  };
}

export { AUTHOR, REVIEWER, githubItemsForQuery, githubReviewRequests, githubEmptyStatuses, githubConfig };
