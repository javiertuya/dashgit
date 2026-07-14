/**
 * Mock GitLab API payloads for review-gitlab.spec.js.
 *
 * One MR per workflow state (S1-S5), all in project acme/repo, authored by AUTHOR and reviewed by
 * REVIEWER. Unlike GitHub, GitLab surfaces the base badges from REST wrappers (review_request for the
 * reviewer, a muted in_review for my authored MRs that already have reviewers) and derives the rest
 * ASYNCHRONOUSLY from a single reviewStates GraphQL query (mute review_request, activate in_review to
 * changes_requested, or show pending_merge). See GitLabAdapter.reviewStates2decisions.
 *
 * The reviewStates GraphQL response is the same regardless of the seeded stakeholder: for the author
 * (role "author") the decision uses "any reviewer requested changes"; for the reviewer (role "reviewer",
 * user = REVIEWER) it matches the REVIEWER node. So a single per-state MR response serves both.
 */

import { STEPS } from "./review-workflow.js";

const AUTHOR = "author-user";
const REVIEWER = "reviewer-user";
const FULL_PATH = "acme/repo";

const IID = { S1: 201, S2: 202, S3: 203, S4: 204, S5: 205 };
const KEY_BY_IID = Object.fromEntries(Object.entries(IID).map(([k, v]) => [v, k]));
const TITLE = Object.fromEntries(STEPS.map((s) => [s.key, s.title]));

// Reviewer node review state per workflow state; S1 has no reviewers yet.
const REVIEW_STATE = { S2: "UNREVIEWED", S3: "REQUESTED_CHANGES", S4: "UNREVIEWED", S5: "REVIEWED" };
// States that already have reviewers assigned (drives the sync in_review badge for the author).
const HAS_REVIEWERS = { S1: false, S2: true, S3: true, S4: true, S5: true };
// States that carry at least one approval.
const APPROVED = { S5: true };

// One GitLab REST merge request (api.MergeRequests.all shape, see test/input/gitlab-rest-result1.json).
function glItem(key) {
  const iid = IID[key];
  const reviewers = HAS_REVIEWERS[key] ? [{ id: 2, username: REVIEWER, state: "active" }] : [];
  return {
    id: 13000 + iid,
    iid,
    title: TITLE[key],
    state: "opened",
    created_at: "2024-02-10T11:10:00.000+01:00",
    updated_at: "2024-02-10T11:11:00.000+01:00",
    author: { id: 32, username: AUTHOR, state: "active" },
    assignees: [],
    assignee: null,
    reviewers,
    labels: [],
    web_url: `https://gitlab.com/${FULL_PATH}/-/merge_requests/${iid}`,
    reference: `!${iid}`,
    references: { short: `!${iid}`, relative: `!${iid}`, full: `${FULL_PATH}!${iid}` },
  };
}

// REST merge_requests response for a given query, depending on the seeded stakeholder.
function gitlabMergeRequestsForQuery(perspective, url) {
  const params = new URL(url).searchParams;
  if (params.has("author_username"))
    return perspective === "author" ? ["S1", "S2", "S3", "S4", "S5"].map(glItem) : [];
  if (params.has("reviewer_username"))
    return perspective === "reviewer" ? ["S2", "S3", "S4", "S5"].map(glItem) : [];
  return []; // assignee_username (assigned MRs) -> none
}

// mergeRequest node for the reviewStates GraphQL, per state.
function mergeRequestNode(key) {
  const iid = IID[key];
  const reviewers = REVIEW_STATE[key]
    ? [{ username: REVIEWER, mergeRequestInteraction: { reviewState: REVIEW_STATE[key] } }]
    : [];
  const approvedBy = APPROVED[key] ? [{ username: REVIEWER }] : [];
  return { iid: String(iid), approvedBy: { nodes: approvedBy }, reviewers: { nodes: reviewers } };
}

// Response for the async reviewStates GraphQL. callGraphqlApi returns the raw body, and the adapter reads
// gqlResponse.data[alias].mergeRequest (the `project(...)` field is aliased to mrN). Aliases -> iid are
// parsed from the outgoing query, so the mapping is order-independent.
function gitlabReviewStates(query) {
  const re = /(\w+):\s*project\(fullPath:\s*"[^"]+"\)\s*\{\s*mergeRequest\(iid:\s*"(\d+)"\)/g;
  const data = {};
  let m;
  while ((m = re.exec(query)) !== null) {
    const alias = m[1];
    const key = KEY_BY_IID[parseInt(m[2], 10)];
    data[alias] = { mergeRequest: key ? mergeRequestNode(key) : null };
  }
  return { data };
}

// Empty projects GraphQL response -> the statuses refinement finds no projects and no-ops.
function gitlabEmptyProjects() {
  return { data: { projects: { nodes: [] } } };
}

function gitlabConfig(perspective) {
  const user = perspective === "author" ? AUTHOR : REVIEWER;
  return {
    version: 3,
    encrypted: false,
    providers: [
      {
        provider: "GitLab",
        url: "https://gitlab.com",
        user,
        token: "glpat-reviewtoken",
        oauth: false,
        enabled: true,
        enableNotifications: true,
      },
    ],
  };
}

export {
  AUTHOR, REVIEWER,
  gitlabMergeRequestsForQuery, gitlabReviewStates, gitlabEmptyProjects, gitlabConfig,
};
