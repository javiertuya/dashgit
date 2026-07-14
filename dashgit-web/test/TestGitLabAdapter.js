import assert from 'assert';
import fs from "fs"
import { Model } from "../app/core/Model.js"
import { gitLabAdapter } from "../app/git/GitLabAdapter.js"

beforeEach(function() {
    if (!fs.existsSync("actual")){
        fs.mkdirSync("actual");
    }});

/**
 * Test the (GitLab) adapters taking as input the provider api response from an external file.
 * Test inputs are created by getting real data, removing unneeded fields
 * and customized to represent the test situations.
 */
describe("TestGitLabAdapter - Model transformations from GitLab API results", function () {

    //Rest API, Issues and Merge Requests:
    // - pr assigned, pr reviewer(not assigned), issue (type ISSUE/INCIDENT)
    // - 0,1,2 assignees
    // - 0,1,2 labels
    // - label not defined/defined/defined in other project
    //
    //Rest API, items from to do lists (used for involved tab, in separate test)
    //https://docs.gitlab.com/ee/api/todos.html
    // - Must be included: target.state opened (each choice)
    //   - action (mentioned, directly_addressed)
    //   - type (Issue/MergeRequests)
    //   - state (pending/done), done is a read notification, but should be included in involved
    // - Must be excluded:
    //   - target.state closed
    it("Transform Gitlab REST API results from Issues and MergeRequests", function () {
        let labels = { "org/proj1-BLOCKING": { "color": "#FF0000" }, "org/projx-BLOCKING": { "color": "#FFFFFF" }, "org/projx-urgent": { "color": "#000000" } }
        let input = JSON.parse(fs.readFileSync("./input/gitlab-rest-result1.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://mygitlab.com' };

        let actual = gitLabAdapter.workitems2model(provider, input, labels);
        fs.writeFileSync("./actual/gitlab-rest-model1.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-rest-model1.json"));
        assert.deepEqual(expected, actual);
    });

    it("Transform Gitlab REST API results with issue type labels", function () {
        let labels = { "org/proj-BLOCKING": { "color": "#FF0000" }, "org/proj-urgent": { "color": "#000000" } };
        let input = JSON.parse(fs.readFileSync("./input/gitlab-rest-result1-issue-types.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://mygitlab.com' };

        let actual = gitLabAdapter.workitems2model(provider, input, labels);
        fs.writeFileSync("./actual/gitlab-rest-model1-issue-types.json", JSON.stringify(actual, null, 2));
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-rest-model1-issue-types.json"));
        assert.deepEqual(expected, actual);
        assert.strictEqual(actual.items[0].labels[0].isIssueType, true);
        assert.strictEqual(actual.items[0].labels[0].name, "incident");
        assert.strictEqual(actual.items[0].labels[1].name, "BLOCKING");
        assert.strictEqual(actual.items[1].labels[0].isIssueType, true);
        assert.strictEqual(actual.items[1].labels[0].name, "task");
        assert.strictEqual(actual.items[1].labels[1].name, "BLOCKING");
        assert.strictEqual(actual.items[2].labels[0].isIssueType, true);
        assert.strictEqual(actual.items[2].labels[0].name, "incident");
        assert.strictEqual(actual.items[2].labels[1].name, "BLOCKING");
        assert.strictEqual(actual.items[2].labels[2].name, "urgent");
        assert.strictEqual(actual.items[2].labels[2].color, "000000");
        assert.strictEqual(actual.items[3].type, "pr");
        assert.strictEqual(actual.items[3].iidstr, "!4");
        assert.strictEqual(actual.items[3].labels[0].name, "BLOCKING");
        // issue #312: the repo name and url must be resolved for both url shapes that GitLab
        // returns for issues, never left empty:
        // - item[0]: older GitLab returns a /-/issues/ url
        assert.strictEqual(actual.items[0].url, "https://mygitlab.com/org/proj/-/issues/1");
        assert.strictEqual(actual.items[0].repo_name, "org/proj");
        assert.strictEqual(actual.items[0].repo_url, "https://mygitlab.com/org/proj");
        // - item[4]: recent GitLab migrated issues to work items, returning a /-/work_items/ url
        //   (and the response may omit the "type" attribute)
        assert.strictEqual(actual.items[4].url, "https://mygitlab.com/org/proj/-/work_items/5");
        assert.strictEqual(actual.items[4].type, "issue");
        assert.strictEqual(actual.items[4].iidstr, "#5");
        assert.strictEqual(actual.items[4].repo_name, "org/proj");
        assert.strictEqual(actual.items[4].repo_url, "https://mygitlab.com/org/proj");
    });

    it("Transform Gitlab REST API results from review requests", function () {
        // Review requests wrap an api response that selects where user is a reviewer to add the review request custom action
        // Just check that the custom action is added to a response and then to the adapted model items
        let input = JSON.parse(fs.readFileSync("./input/gitlab-rest-result1.json"));
        let wrappedInput = gitLabAdapter.addActionToMergeRequestItems([input[2], input[3]], "review_request");

        let actual = gitLabAdapter.workitems2model({}, wrappedInput, {});
        assert.deepEqual({ review_request: true }, actual.items[0].actions);
        assert.deepEqual({ review_request: true }, actual.items[1].actions);
    });

    it("Transform Gitlab REST API results from TodoLists", function () {
        let labels = { "org2/proj2-BLOCKING": { "color": "#FF0000" } }
        let input = JSON.parse(fs.readFileSync("./input/gitlab-rest-result2.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://mygitlab.com' };

        let actual = gitLabAdapter.workitems2model(provider, input, labels);
        fs.writeFileSync("./actual/gitlab-rest-model2.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-rest-model2.json"));
        assert.deepEqual(expected, actual);
    });

    it("Transform Gitlab GraphQL API labels", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitlab-rest-labels.json"));
        let actual = gitLabAdapter.labels2model(input);

        fs.writeFileSync("./actual/gitlab-rest-labels.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-rest-labels.json"));
        assert.deepEqual(expected, actual);
    });

    //Retured model same schema as work items: a linear view of all branches
    // - archived(excluded)/no archived
    // - 1/more branches
    it("Transform Gitlab GraphQL API projects: must flatten branches of unarchived projs", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitlab-graphql-projects.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://mygitlab.com' };

        let actual = gitLabAdapter.projects2model(provider, input);
        fs.writeFileSync("./actual/gitlab-graphql-projects.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-projects.json"));
        assert.deepEqual(expected, actual);

        //check transformation into an array de guids
        assert.deepEqual(['gid://gitlab/Project/5', 'gid://gitlab/Project/6', 'gid://gitlab/Project/7'], gitLabAdapter.model4projectIds(actual));
    });

    //Data about follow ups is stored in the manager repository, but it is transformed to models as it if where from the GitHub api
    it("Transform GitLab Follow up results from GitStoreApi", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitstore-follow-up-result.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://gitlab.com', api: 'https://gitlab.com/api/v3' };
        let actual = gitLabAdapter.workitems2model(provider, input.followUp);
        fs.writeFileSync("./actual/gitstore-follow-up-gitlab-model.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitstore-follow-up-gitlab-model.json"));
        assert.deepEqual(expected, actual);
    });

    // Statuses is a little bit more tricky. Can be viewed as a join of the result 2 queries: projects (with branches) 
    // and statuses (with pipelines and MRs). Pipelines include branches (multiple branches if multiple builds).
    // Only branches in projects are shown (even if no pipeline), as branches in pipelines without projects are deleted branches
    // Join is: branches in projects LEFT branches in pipelines LEFT MRs, situations are mutations of the join type
    // - Branches that are in projects
    //   - branch in pipelines with MR (org1/proj5 feature)
    //   - branch in pipelines without MR (org1/proj5 main)
    //   - neither branch in pipelines nor MR (org2/proj6 main)
    //   - MR but not branch in pipelines (org2/proj7 branch1) status unknown because the pipelinte item was purged
    //     FAILS (issue #3): it should have branch_url, created_at, updated_at, the status is right (unknown)
    // - Branches that are not in projects, must not be shown, maybe the branch was deleted.
    //   But after issue #273, the MR could be recent and be used to complete the branches in the model
    //   - pipeline and MR (org2/proj7 hidden1): should be shown with valid status
    //   - pipeline and not MR (org2/proj7 hidden2): should be hidden, it could be a deleted branch
    //   - MR and not pipeline (org2/proj7 hidden3): should be shown with notavailable status
    // Secondary situations
    // - Number of items in pipeline for same branch: one/more (add pipeline 6540 to feature covers more)
    // - In progress pipeline (no finishedAt date) (org1/proj5 building branch)
    // - Status coverage of all values at: https://docs.gitlab.com/ee/api/pipelines.html (in dedicated test)
    //
    it("Transform Gitlab GraphQL API statuses: must join projects, pipelines and MRs", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitlab-graphql-statuses.json"));
        //projects are read from the expected output of the previous test, important to have the real fields and defaults
        let projectsObj = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-projects.json"));
        let projects = new Model().fromObject(projectsObj);

        let actual = gitLabAdapter.statuses2model(projects, input);
        fs.writeFileSync("./actual/gitlab-graphql-statuses.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-statuses.json"));
        assert.deepEqual(expected, actual);
    });

    //Issue #17 shows some graphql responses that have null values in iterable nodes.
    //Check null values in:
    // - projects: repository, branches (must remove the entire project as there are no branches)
    // - statuses: pipelines, merge requests
    it("Transform Gitlab GraphQL API projects: must handle null iterables", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitlab-graphql-projects-null.json"));
        let provider = { provider: "GitLab", uid: "0-gitlab", user: "usr1", url: 'https://mygitlab.com' };

        let actual = gitLabAdapter.projects2model(provider, input);
        fs.writeFileSync("./actual/gitlab-graphql-projects-null.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-projects-null.json"));
        assert.deepEqual(expected, actual);
    });
    it("Transform Gitlab GraphQL API statuses: must handle null iterables", function () {
        let input = JSON.parse(fs.readFileSync("./input/gitlab-graphql-statuses-null.json"));
        //previous test leaves projects 4 and 7 and removes others, use these to match with statuses
        let projectsObj = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-projects-null.json"));
        let projects = new Model().fromObject(projectsObj);

        let actual = gitLabAdapter.statuses2model(projects, input);
        fs.writeFileSync("./actual/gitlab-graphql-statuses-null.json", JSON.stringify(actual, null, 2)); //to allow extenal diff
        let expected = JSON.parse(fs.readFileSync("./expected/gitlab-graphql-statuses-null.json"));
        assert.deepEqual(expected, actual);
    });

    [
        { input: "created", expected: "pending" },
        { input: "waiting_for_resource", expected: "pending" },
        { input: "preparing", expected: "pending" },
        { input: "pending", expected: "pending" },
        { input: "running", expected: "pending" },
        { input: "success", expected: "success" },
        { input: "failed", expected: "failure" },
        { input: "canceled", expected: "failure" },
        { input: "skipped", expected: "failure" },
        { input: "manual", expected: "pending" },
        { input: "scheduled", expected: "pending" }
    ].forEach(function (item) {
        it(`GitLab Pipeline status conversion: ${item.input} to ${item.expected}`, function () {
            assert.equal(item.expected, gitLabAdapter.transformStatus(item.input));
            assert.equal(item.expected, gitLabAdapter.transformStatus(item.input.toUpperCase()));
        });
    });

    // Authored MRs get a muted "in review" action only when they already have reviewers assigned.
    it("Flag authored MRs with reviewers as in review", function () {
        let response = [
            { iid: 1, reviewers: [{ username: "rev1" }] },                 // has reviewers -> in_review
            { iid: 2, reviewers: [] },                                     // no reviewers -> untouched
            { iid: 3 },                                                    // missing reviewers -> untouched
            { iid: 4, reviewers: [{ username: "rev1" }], custom_actions: { review_request: true } }, // keeps existing action
        ];
        let actual = gitLabAdapter.addInReviewActionToMergeRequests(response);
        assert.deepEqual({ in_review: true }, actual[0].custom_actions);
        assert.equal(undefined, actual[1].custom_actions);
        assert.equal(undefined, actual[2].custom_actions);
        assert.deepEqual({ review_request: true, in_review: true }, actual[3].custom_actions);
    });

    // Decide the per-role action from the reviewers' review states and the approvals.
    // Precedence: pendingMerge (approved and no changes requested) > muted/changesRequested.
    // Reviewer role: muted when MY reviewState is REQUESTED_CHANGES. Author role: changesRequested when
    // any reviewer requested changes. pendingMerge (either role) when there is an approval and no reviewer
    // requests changes; only when enablePendingMerge is on.
    it("Decide review-badge actions from the reviewers review states and approvals (both roles)", function () {
        let prs = [
            { uid: "g/p!1", alias: "mr0", role: "reviewer" }, // I requested changes -> muted
            { uid: "g/p!2", alias: "mr1", role: "reviewer" }, // I have not reviewed yet -> not muted
            { uid: "g/p!3", alias: "mr2", role: "reviewer" }, // another reviewer requested changes, not me -> not muted
            { uid: "g/p!4", alias: "mr3", role: "reviewer" }, // inaccessible project (null) -> nothing
            { uid: "g/p!5", alias: "mr4", role: "reviewer" }, // mergeRequest without reviewers -> nothing
            { uid: "g/p!6", alias: "mr5", role: "author" },   // a reviewer requested changes -> changesRequested
            { uid: "g/p!7", alias: "mr6", role: "author" },   // reviewers exist but none requested changes -> nothing
            { uid: "g/p!8", alias: "mr7", role: "author" },   // no reviewers -> nothing
            { uid: "g/p!9", alias: "mr8", role: "author" },   // approved, no changes -> pendingMerge
            { uid: "g/p!10", alias: "mr9", role: "reviewer" },// approved, no changes -> pendingMerge (over review request)
            { uid: "g/p!11", alias: "mr10", role: "author" }, // approved but a reviewer requested changes -> changesRequested
        ];
        let gqlResponse = { data: {
            mr0: { mergeRequest: { iid: "1", reviewers: { nodes: [{ username: "usr1", mergeRequestInteraction: { reviewState: "REQUESTED_CHANGES" } }] } } },
            mr1: { mergeRequest: { iid: "2", reviewers: { nodes: [{ username: "usr1", mergeRequestInteraction: { reviewState: "UNREVIEWED" } }] } } },
            mr2: { mergeRequest: { iid: "3", reviewers: { nodes: [{ username: "other", mergeRequestInteraction: { reviewState: "REQUESTED_CHANGES" } }] } } },
            mr3: null,
            mr4: { mergeRequest: { iid: "5" } },
            mr5: { mergeRequest: { iid: "6", reviewers: { nodes: [
                { username: "rev1", mergeRequestInteraction: { reviewState: "REVIEWED" } },
                { username: "rev2", mergeRequestInteraction: { reviewState: "REQUESTED_CHANGES" } },
            ] } } },
            mr6: { mergeRequest: { iid: "7", reviewers: { nodes: [{ username: "rev1", mergeRequestInteraction: { reviewState: "UNREVIEWED" } }] } } },
            mr7: { mergeRequest: { iid: "8", reviewers: { nodes: [] } } },
            mr8: { mergeRequest: { iid: "9", approvedBy: { nodes: [{ username: "rev1" }] }, reviewers: { nodes: [{ username: "rev1", mergeRequestInteraction: { reviewState: "APPROVED" } }] } } },
            mr9: { mergeRequest: { iid: "10", approvedBy: { nodes: [{ username: "usr1" }] }, reviewers: { nodes: [{ username: "usr1", mergeRequestInteraction: { reviewState: "APPROVED" } }] } } },
            mr10: { mergeRequest: { iid: "11", approvedBy: { nodes: [{ username: "rev1" }] }, reviewers: { nodes: [{ username: "rev2", mergeRequestInteraction: { reviewState: "REQUESTED_CHANGES" } }] } } },
        } };
        let actual = gitLabAdapter.reviewStates2decisions(prs, gqlResponse, "usr1", true);
        assert.deepEqual([
            { uid: "g/p!1", muted: true, changesRequested: false, pendingMerge: false },
            { uid: "g/p!2", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!3", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!4", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!5", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!6", muted: false, changesRequested: true, pendingMerge: false },
            { uid: "g/p!7", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!8", muted: false, changesRequested: false, pendingMerge: false },
            { uid: "g/p!9", muted: false, changesRequested: false, pendingMerge: true },
            { uid: "g/p!10", muted: false, changesRequested: false, pendingMerge: true },
            { uid: "g/p!11", muted: false, changesRequested: true, pendingMerge: false },
        ], actual);
    });

    // With pending-merge disabled, an approved MR yields no pendingMerge (stays as its review state).
    it("Does not flag pending merge when enablePendingMerge is off", function () {
        let prs = [{ uid: "g/p!9", alias: "mr8", role: "author" }];
        let gqlResponse = { data: {
            mr8: { mergeRequest: { iid: "9", approvedBy: { nodes: [{ username: "rev1" }] }, reviewers: { nodes: [{ username: "rev1", mergeRequestInteraction: { reviewState: "APPROVED" } }] } } },
        } };
        let actual = gitLabAdapter.reviewStates2decisions(prs, gqlResponse, "usr1", false);
        assert.deepEqual([{ uid: "g/p!9", muted: false, changesRequested: false, pendingMerge: false }], actual);
    });

});