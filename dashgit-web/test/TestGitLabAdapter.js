import assert from 'assert';
import fs from "fs"
import { Model } from "../app/Model.js"
import { gitLabAdapter } from "../app/GitLabAdapter.js"

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
    //   - pipeline and MR (org2/proj7 hidden1)
    //   - pipeline and not MR (org2/proj7 hidden2)
    //   - MR and not pipeline (org2/proj7 hidden3)
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

});