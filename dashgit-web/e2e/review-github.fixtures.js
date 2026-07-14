/**
 * Mock GitHub API payloads for review-github.spec.js.
 *
 * One PR per workflow state (S1-S5), all in repo acme/repo, authored by AUTHOR and reviewed by REVIEWER.
 * GitHub surfaces the base badges SYNCHRONOUSLY through separate /search/issues queries (the app tags the
 * returned items via GitHubAdapter.addActionToPullRequestItems); the authored query returns ALL my open
 * PRs so what I am working on shows in Assigned. It then refines them ASYNCHRONOUSLY with a GraphQL
 * reviewRequests query that adds "in review" to an authored PR under review and mutes "changes requested"
 * to "in review" once the author re-requested review.
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

// Per-state day: an earlier workflow state is a more recently active PR (a just-created PR is newer than
// a long-open approved one), so with the default "recently updated" sort the rows come out S1..S5.
const DAY = { S1: "08", S2: "07", S3: "06", S4: "05", S5: "04" };

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
    created_at: `2024-01-${DAY[key]}T12:00:00Z`,
    updated_at: `2024-01-${DAY[key]}T12:30:00Z`,
    pull_request: { html_url: `https://github.com/${OWNER}/${REPO}/pull/${n}` },
  };
}

// Items returned for a /search/issues `q`, depending on the seeded stakeholder. Branch on the most
// specific token first (reviewed-by: before the generic review:approved, and both review:* before the
// generic author: authored query) to route each query to its real result. Duplicate rows across queries
// (e.g. S3/S4/S5 appear in both a review:* query and the authored query) are deduped/merged by
// wiServices.merge, so each state still renders as a single row.
function githubItemsForQuery(perspective, q) {
  if (!q) return [];
  if (perspective === "author") {
    if (q.includes("user-review-requested:")) return []; // author is not a requested reviewer
    if (q.includes("review:changes_requested")) return [ghItem("S3"), ghItem("S4")];
    if (q.includes("reviewed-by:")) return []; // mergeReviewer: author did not review
    if (q.includes("review:approved")) return [ghItem("S5")]; // mergeAuthor: author:USER review:approved
    if (q.includes("author:")) return STEPS.map((s) => ghItem(s.key)); // authored: ALL my open PRs (S1-S5)
    return []; // assigned (the author is not the assignee of these PRs)
  }
  // reviewer perspective
  if (q.includes("user-review-requested:")) return [ghItem("S2"), ghItem("S4")];
  if (q.includes("review:changes_requested")) return []; // reviewer did not author
  if (q.includes("reviewed-by:")) return [ghItem("S5")]; // mergeReviewer: reviewed-by:USER review:approved
  if (q.includes("review:approved")) return []; // mergeAuthor: author:USER (reviewer isn't the author)
  if (q.includes("author:")) return []; // authored: reviewer did not author these PRs
  return []; // assigned
}

// Response for the async GraphQL getReviewRequestsQuery. octokit graphql() returns the `data` object, so
// the mock body is { data: { <alias>: { pullRequest: { reviewRequests: { nodes } } } } }. The PRs with a
// pending review request are S2 (review requested) and S4 (re-requested): for my authored S2 this adds an
// "in review" badge, and for my changes-requested S4 it mutes the badge to "in review". S1/S3 have no
// pending request (S1 has no reviewers; at S3 the ball is with me, I have not re-requested yet).
function githubReviewRequests(rawPostData) {
  const query = JSON.parse(rawPostData).query;
  const re = /(\w+):\s*repository\(owner:\s*"[^"]+",\s*name:\s*"[^"]+"\)\s*\{\s*pullRequest\(number:\s*(\d+)\)/g;
  const data = {};
  let m;
  while ((m = re.exec(query)) !== null) {
    const alias = m[1];
    const n = parseInt(m[2], 10);
    const pending = n === NUMBERS.S2 || n === NUMBERS.S4;
    const nodes = pending ? [{ requestedReviewer: { login: REVIEWER } }] : [];
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
