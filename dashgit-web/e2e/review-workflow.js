/**
 * Shared definition of the review workflow used by both review-github.spec.js and review-gitlab.spec.js.
 *
 * A single merge/pull request lifecycle runs through five states (S1-S5). For every state we assert how
 * each stakeholder sees it in their own Assigned tab: the AUTHOR (provider seeded with the author user)
 * and the REVIEWER (provider seeded with the reviewer user). The same steps are walked for GitHub and
 * GitLab; the expectation differs per provider because the badges look different at some steps and some
 * items are visible in one provider but not the other (see AGENTS.md, "Assigned review-workflow badges").
 *
 * Each state carries a unique `title` (used to render one item per state in a single Assigned view and to
 * locate its row) and a 4-way expectation `{ author:{github,gitlab}, reviewer:{github,gitlab} }`, where
 * each cell is one of:
 *   - "hidden"            -> the item is not surfaced in that stakeholder's Assigned view
 *   - { none: true }      -> the row is shown but carries no review action badge
 *   - { selector, text, muted? } -> the row shows a badge matching `selector` with `text`; `muted` also
 *                            asserts the dimmed (opacity-50) styling applied by the async refinement
 *
 * Badge DOM (WiViewRender.js actions2html + WiView.js mute/activate helpers): the muted/activated badges
 * keep their base class and only change text/styling, so the selector below matches the FINAL element.
 */

import { expect } from "@playwright/test";

// Base (synchronous) badges, matched by their stable wi-action-* class.
const REVIEW_REQUEST = { selector: ".wi-action-review-request", text: "review request" };
const CHANGES_REQUESTED = { selector: ".wi-action-changes-requested", text: "changes requested" };
const IN_REVIEW = { selector: ".wi-action-in-review", text: "in review" };
const PENDING_MERGE = { selector: ".wi-action-pending-merge", text: "pending merge" };
// Async transformations that keep the base class but change text + add the dimmed styling.
const REVIEW_REQUEST_MUTED = { selector: ".wi-action-review-request", text: "changes requested", muted: true }; // GitLab reviewer
const CHANGES_REQUESTED_MUTED = { selector: ".wi-action-changes-requested", text: "in review", muted: true }; // GitHub author

// Ordered lifecycle. `title` is shared by both providers' fixtures for the same state.
const STEPS = [
  {
    key: "S1", title: "wf-s1 created no reviewers",
    desc: "Created, no reviewers yet",
    author: { github: { none: true }, gitlab: { none: true } },
    reviewer: { github: "hidden", gitlab: "hidden" },
  },
  {
    key: "S2", title: "wf-s2 review requested",
    desc: "Reviewers assigned, not yet reviewed",
    author: { github: IN_REVIEW, gitlab: IN_REVIEW },
    reviewer: { github: REVIEW_REQUEST, gitlab: REVIEW_REQUEST },
  },
  {
    key: "S3", title: "wf-s3 changes requested",
    desc: "A reviewer requested changes (ball with the author)",
    author: { github: CHANGES_REQUESTED, gitlab: CHANGES_REQUESTED },
    reviewer: { github: "hidden", gitlab: REVIEW_REQUEST_MUTED },
  },
  {
    key: "S4", title: "wf-s4 re requested",
    desc: "The author re-requested review (ball back with the reviewer)",
    author: { github: CHANGES_REQUESTED_MUTED, gitlab: IN_REVIEW },
    reviewer: { github: REVIEW_REQUEST, gitlab: REVIEW_REQUEST },
  },
  {
    key: "S5", title: "wf-s5 approved",
    desc: "Approved, still open (pending merge)",
    author: { github: PENDING_MERGE, gitlab: PENDING_MERGE },
    reviewer: { github: PENDING_MERGE, gitlab: PENDING_MERGE },
  },
];

// Locator for the Assigned panel of a provider (uid is `<index>-<provider>`, e.g. "0-github").
function assignedPanel(page, providerUid) {
  return page.locator(`#wi-items-assigned_${providerUid}_all`);
}

// Asserts one workflow state for one stakeholder. `expectation` is a cell of the matrix above.
async function expectState(panel, step, expectation) {
  const row = panel.locator("tr[itemtype]", { hasText: step.title });
  if (expectation === "hidden") {
    await expect(row, `${step.key} "${step.title}" should not be visible`).toHaveCount(0);
    return;
  }
  await expect(row, `${step.key} "${step.title}" should be visible`).toHaveCount(1);
  if (expectation.none) {
    await expect(row.locator(".wi-action-badge")).toHaveCount(0);
    return;
  }
  const badge = row.locator(expectation.selector);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(expectation.text);
  if (expectation.muted)
    await expect(badge).toHaveClass(/opacity-50/);
}

// Walks all steps for one stakeholder ("author" | "reviewer") of one provider ("github" | "gitlab").
async function expectWorkflow(page, providerUid, provider, role) {
  const panel = assignedPanel(page, providerUid);
  await expect(panel).toBeVisible();
  for (const step of STEPS)
    await expectState(panel, step, step[role][provider]);
}

export { STEPS, assignedPanel, expectState, expectWorkflow };
